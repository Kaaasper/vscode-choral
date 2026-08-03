// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'path';
import * as vscode from 'vscode';
import { workspace } from 'vscode';
import {
	Executable,
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	Trace,
} from 'vscode-languageclient/node';
import { ChoreographyPanel } from './choreographyPanel';
import { findOrInstallChoral } from './installer';

let client: LanguageClient;
const DIAGRAM_REQUEST = 'choral/choreographyDiagram';

interface ChoreographyDiagramParams {
	textDocument: { uri: string };
	position: vscode.Position;
}

interface ChoreographyDiagramError {
	error: { message: string; code?: string };
}

function getDiagramError(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || !('error' in value)) {
		return undefined;
	}
	const error = (value as ChoreographyDiagramError).error;
	return typeof error?.message === 'string' ? error.message : undefined;
}

// This method is called when extension is activated.
// Extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	console.log('Activating the Choral VS Code extension...');

	// Refer to: https://github.com/tempo-lang/vscode-tempo/blob/main/src/extension.ts
	try {
		// Ensure the Choral JAR is available, downloading if necessary
		const serverJarPath: string = await findOrInstallChoral(context);
		console.log('Using JAR at:', serverJarPath);

		const serverOptions: ServerOptions = {
			command: 'java',
			args: ['-jar', serverJarPath, 'lsp'],
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: 'file', language: 'choral' }],
			synchronize: {
				fileEvents: workspace.createFileSystemWatcher('**/*.{ch,chh}')
			},
			outputChannel: vscode.window.createOutputChannel('Choral Language Server'),
			traceOutputChannel: vscode.window.createOutputChannel('Choral LSP Trace'),
		};
		client = new LanguageClient(
			'choral', // Make sure this matches package.json! Settings like `choral.languageServer.trace` depend on it.
			'Choral Language Server',
			serverOptions,
			clientOptions
		);

		console.log('Starting LSP client...');
		client.start().then(
			() => {
				console.log('✓ LSP client started successfully');
				vscode.window.showInformationMessage('Choral LSP started!');
			},
			(error) => {
				console.error('✗ LSP client failed to start:', error);
				vscode.window.showErrorMessage('Choral LSP failed to start: ' + error);
			}
		);

		const panel = new ChoreographyPanel(context.extensionUri);
		let refreshVersion = 0;
		let selectionTimer: ReturnType<typeof setTimeout> | undefined;
		let lastDiagram: string | undefined;

		const isChoralEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor =>
			editor?.document.languageId === 'choral';

		const refresh = async (): Promise<void> => {
			if (!panel.isVisible()) {
				return;
			}
			const editor = vscode.window.activeTextEditor;
			// Focusing the choreography webview temporarily removes the active text editor.
			// Keep the last diagram visible so its controls remain usable.
			if (!editor) {
				return;
			}
			if (!isChoralEditor(editor)) {
				panel.show({ kind: 'empty', message: 'Select a Choral choreography to visualize.' });
				return;
			}

			const requestVersion = ++refreshVersion;
			const params: ChoreographyDiagramParams = {
				textDocument: { uri: editor.document.uri.toString() },
				position: editor.selection.active,
			};
			try {
				const result = await client.sendRequest<unknown>(DIAGRAM_REQUEST, params);
				if (requestVersion !== refreshVersion || !panel.isVisible()) {
					return;
				}
				if (typeof result === 'string') {
					lastDiagram = result;
					panel.show({ kind: 'diagram', mermaid: result });
					return;
				}
				const error = getDiagramError(result)
					?? 'The Choral language server returned an invalid choreography diagram response.';
				if (lastDiagram) {
					panel.show({ kind: 'diagram', mermaid: lastDiagram, staleMessage: error });
				} else {
					panel.show({ kind: 'error', message: error });
				}
			} catch (error) {
				if (requestVersion !== refreshVersion || !panel.isVisible()) {
					return;
				}
				const errorMessage = error instanceof Error ? error.message : String(error);
				const message = `Unable to analyze choreography: ${errorMessage}`;
				if (lastDiagram) {
					panel.show({ kind: 'diagram', mermaid: lastDiagram, staleMessage: message });
				} else {
					panel.show({ kind: 'error', message });
				}
			}
		};

		const scheduleRefresh = (): void => {
			if (selectionTimer) {
				clearTimeout(selectionTimer);
			}
			selectionTimer = setTimeout(() => {
				void refresh();
			}, 150);
		};

		context.subscriptions.push(panel);
		context.subscriptions.push(panel.onDidDispose(() => {
			if (selectionTimer) {
				clearTimeout(selectionTimer);
				selectionTimer = undefined;
			}
		}));
		context.subscriptions.push(vscode.commands.registerCommand(
			'choral.showChoreography',
			async () => {
				panel.reveal();
				await refresh();
			}
		));
		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
			void refresh();
		}));
		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
			if (document.languageId === 'choral') {
				void refresh();
			}
		}));
		context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
			if (event.textEditor === vscode.window.activeTextEditor && isChoralEditor(event.textEditor)) {
				scheduleRefresh();
			}
		}));

		context.subscriptions.push(
			vscode.commands.registerCommand(
				'choral.insertComms', // This should match the command in package.json
				async () => {
					const editor = vscode.window.activeTextEditor;
					if (!editor || editor.document.languageId !== 'choral') {
						vscode.window.showErrorMessage("Choral LSP client can't find the Choral file!");
						return;
					}

					try {
						// Send current buffer content to server
						const result = await client.sendRequest('workspace/executeCommand', {
							command: 'choral.insertComms',
							arguments: [
								editor.document.getText()
							]
						});

						// Replace the entire document with the modified content
						if (result && typeof result === 'string') {
							const edit = new vscode.WorkspaceEdit();
							const fullRange = new vscode.Range(
								editor.document.positionAt(0),
								editor.document.positionAt(editor.document.getText().length)
							);
							edit.replace(editor.document.uri, fullRange, result);
							await vscode.workspace.applyEdit(edit);
						}
						else {
							console.error('Unexpected response from choral.insertComms. ' +
								'Expected string, got: ', result);
						}
					} catch (error) {
						console.error('Error executing choral.insertComms:', error);
						vscode.window.showErrorMessage('Failed to insert missing communications: ' + error);
					}
				}
			)
		);

	} catch (error) {
		console.error('ERROR activating Choral extension:', error);
		vscode.window.showErrorMessage('Choral extension error: ' + error);
	}


}

// This method is called when extension is deactivated
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
