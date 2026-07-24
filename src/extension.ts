import * as vscode from 'vscode';
import { workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { CHOREOGRAPHY_DIAGRAM_FORMAT, ChoreographyDiagramParams, getDiagramError, getDiagramResponseError, isChoreographyDiagram, RenderedChoreographyDiagram, supportsChoreographyDiagram } from './choreography';
import { ChoreographyPanel } from './choreographyPanel';
import { findOrInstallChoral } from './installer';

let client: LanguageClient;
const DIAGRAM_REQUEST = 'choral/choreographyDiagram';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Activating the Choral VS Code extension...');
	await vscode.commands.executeCommand('setContext', 'choral.choreographyDiagramAvailable', false);

	try {
		const serverJarPath = await findOrInstallChoral(context);
		const serverOptions: ServerOptions = { command: 'java', args: ['-jar', serverJarPath, 'lsp'] };
		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: 'file', language: 'choral' }],
			synchronize: { fileEvents: workspace.createFileSystemWatcher('**/*.{ch,chh}') },
			outputChannel: vscode.window.createOutputChannel('Choral Language Server'),
			traceOutputChannel: vscode.window.createOutputChannel('Choral LSP Trace'),
		};
		client = new LanguageClient('choral', 'Choral Language Server', serverOptions, clientOptions);

		const panel = new ChoreographyPanel(context.extensionUri);
		let diagramAvailable = false;
		let refreshVersion = 0;
		let selectionTimer: ReturnType<typeof setTimeout> | undefined;
		let lastDiagram: RenderedChoreographyDiagram | undefined;

		const isChoralEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor => editor?.document.languageId === 'choral';
		const refresh = async (): Promise<void> => {
			if (!panel.isVisible()) { return; }
			const editor = vscode.window.activeTextEditor;
			if (!isChoralEditor(editor)) {
				panel.show({ kind: 'empty', message: 'Select a Choral choreography to visualize.' });
				return;
			}
			if (!diagramAvailable) {
				panel.show({ kind: 'error', message: 'The active Choral language server does not support choreography visualization. Upgrade Choral and restart VS Code.' });
				return;
			}

			const requestVersion = ++refreshVersion;
			const params: ChoreographyDiagramParams = { textDocument: { uri: editor.document.uri.toString() }, position: editor.selection.active, format: CHOREOGRAPHY_DIAGRAM_FORMAT };
			try {
				const result = await client.sendRequest<unknown>(DIAGRAM_REQUEST, params);
				if (requestVersion !== refreshVersion || !panel.isVisible()) { return; }
				if (isChoreographyDiagram(result)) {
					lastDiagram = result;
					panel.show({ kind: 'diagram', diagram: result });
					return;
				}
				const error = getDiagramError(result) ?? getDiagramResponseError(result);
				if (lastDiagram) { panel.show({ kind: 'diagram', diagram: lastDiagram, staleMessage: error }); }
				else { panel.show({ kind: 'error', message: error }); }
			} catch (error) {
				if (requestVersion !== refreshVersion || !panel.isVisible()) { return; }
				const message = `Unable to analyze choreography: ${error instanceof Error ? error.message : String(error)}`;
				if (lastDiagram) { panel.show({ kind: 'diagram', diagram: lastDiagram, staleMessage: message }); }
				else { panel.show({ kind: 'error', message }); }
			}
		};
		const scheduleRefresh = (): void => {
			if (selectionTimer) { clearTimeout(selectionTimer); }
			selectionTimer = setTimeout(() => { void refresh(); }, 150);
		};

		context.subscriptions.push(panel);
		context.subscriptions.push(panel.onDidDispose(() => { if (selectionTimer) { clearTimeout(selectionTimer); selectionTimer = undefined; } }));
		context.subscriptions.push(vscode.commands.registerCommand('choral.showChoreography', async () => {
			if (!diagramAvailable) {
				vscode.window.showWarningMessage('Choreography visualization requires a newer Choral language server. Upgrade Choral and restart VS Code.');
				return;
			}
			panel.reveal();
			await refresh();
		}));
		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => { void refresh(); }));
		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => { if (document.languageId === 'choral') { void refresh(); } }));
		context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => { if (event.textEditor === vscode.window.activeTextEditor && isChoralEditor(event.textEditor)) { scheduleRefresh(); } }));
		context.subscriptions.push(vscode.commands.registerCommand('choral.insertComms', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!isChoralEditor(editor)) { vscode.window.showErrorMessage("Choral LSP client can't find the Choral file!"); return; }
			try {
				const result = await client.sendRequest<unknown>('workspace/executeCommand', { command: 'choral.insertComms', arguments: [editor.document.getText()] });
				if (typeof result !== 'string') { console.error('Unexpected response from choral.insertComms:', result); return; }
				const edit = new vscode.WorkspaceEdit();
				edit.replace(editor.document.uri, new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)), result);
				await vscode.workspace.applyEdit(edit);
			} catch (error) {
				console.error('Error executing choral.insertComms:', error);
				vscode.window.showErrorMessage('Failed to insert missing communications: ' + error);
			}
		}));

		await client.start();
		const experimental = client.initializeResult?.capabilities.experimental as { choral?: { choreographyDiagram?: unknown } } | undefined;
		diagramAvailable = supportsChoreographyDiagram(experimental?.choral?.choreographyDiagram);
		await vscode.commands.executeCommand('setContext', 'choral.choreographyDiagramAvailable', diagramAvailable);
		if (!diagramAvailable) { console.warn('Choral language server does not advertise choreography visualization support.'); }
	} catch (error) {
		console.error('ERROR activating Choral extension:', error);
		vscode.window.showErrorMessage('Choral extension error: ' + error);
	}
}

export function deactivate(): Thenable<void> | undefined { return client ? client.stop() : undefined; }
