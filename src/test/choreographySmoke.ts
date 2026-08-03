import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMessageConnection, MessageConnection } from 'vscode-jsonrpc/node';

const DIAGRAM_REQUEST = 'choral/choreographyDiagram';
const REQUEST_TIMEOUT_MS = 20_000;

interface SourcePosition {
	line: number;
	character: number;
}

function argument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	if (index < 0) {
		return undefined;
	}
	const value = process.argv[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`Expected a value after ${name}.`);
	}
	return value;
}

function requiredJarPath(): string {
	const configured = argument('--jar') ?? process.env.CHORAL_LSP_JAR;
	if (!configured) {
		throw new Error(
			'Provide the Choral standalone JAR explicitly with --jar <path> '
			+ 'or CHORAL_LSP_JAR. The smoke test never uses the extension-host cache.'
		);
	}
	const jarPath = path.resolve(configured);
	if (!fs.statSync(jarPath, { throwIfNoEntry: false })?.isFile()) {
		throw new Error(`Choral standalone JAR not found at: ${jarPath}`);
	}
	return jarPath;
}

function positionOf(source: string, marker: string): SourcePosition {
	const offset = source.indexOf(marker);
	if (offset < 0) {
		throw new Error(`Smoke-test fixture does not contain marker: ${marker}`);
	}
	const before = source.slice(0, offset);
	const lines = before.split(/\r?\n/);
	return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

function withTimeout<T>(operation: Promise<T>, description: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`${description} timed out after ${REQUEST_TIMEOUT_MS}ms.`));
		}, REQUEST_TIMEOUT_MS);
		operation.then(
			value => {
				clearTimeout(timer);
				resolve(value);
			},
			error => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

async function stopServer(connection: MessageConnection, server: ReturnType<typeof spawn>): Promise<void> {
	try {
		await withTimeout(connection.sendRequest('shutdown'), 'LSP shutdown request');
		await connection.sendNotification('exit');
	} catch {
		server.kill();
	} finally {
		connection.dispose();
	}
}

async function smokeTest(): Promise<void> {
	const jarPath = requiredJarPath();
	const fixturePath = path.resolve(__dirname, '../../src/test/fixtures/ChoreographyDiagramSmoke.ch');
	const source = fs.readFileSync(fixturePath, 'utf8');
	const documentUri = pathToFileURL(fixturePath).toString();
	const java = process.env.JAVA_HOME
		? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
		: 'java';
	const server = spawn(java, ['-jar', jarPath, 'lsp']);
	let stderr = '';
	server.stderr.setEncoding('utf8');
	server.stderr.on('data', chunk => {
		stderr += String(chunk);
	});
	const connection = createMessageConnection(server.stdout, server.stdin);
	connection.listen();

	try {
		const initializeResult = await withTimeout(connection.sendRequest<unknown>('initialize', {
			processId: process.pid,
			clientInfo: { name: 'vscode-choral-smoke-test' },
			rootUri: pathToFileURL(path.dirname(fixturePath)).toString(),
			capabilities: {},
			workspaceFolders: null,
		}), 'LSP initialize request');
		assert.ok(
			typeof initializeResult === 'object' && initializeResult !== null
				&& 'capabilities' in initializeResult,
			'Choral LSP initialize response did not contain server capabilities.'
		);
		await connection.sendNotification('initialized', {});
		await connection.sendNotification('textDocument/didOpen', {
			textDocument: {
				uri: documentUri,
				languageId: 'choral',
				version: 1,
				text: source,
			},
		});

		const diagram = await withTimeout(connection.sendRequest<unknown>(DIAGRAM_REQUEST, {
			textDocument: { uri: documentUri },
			position: positionOf(source, 'void run'),
		}), 'Choreography diagram request');
		if (typeof diagram !== 'string') {
			assert.fail('choral/choreographyDiagram must return Mermaid source as a bare string.');
		}
		assert.match(diagram, /^sequenceDiagram(?:\r?\n|$)/);
		assert.match(diagram, /p_A->>p_B: message/);

		const mermaid = (await import('mermaid')).default;
		await mermaid.parse(diagram);
		console.log(`Choreography smoke test passed using ${jarPath}`);
	} catch (error) {
		const serverLog = stderr.trim();
		const detail = serverLog ? `\nChoral language server stderr:\n${serverLog}` : '';
		throw new Error(`${error instanceof Error ? error.message : String(error)}${detail}`);
	} finally {
		await stopServer(connection, server);
	}
}

if (require.main === module) {
	void smokeTest().catch(error => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
