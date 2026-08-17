import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ChoreographyPanel, PanelState } from './choreographyPanel';

const DIAGRAM_REQUEST = 'choral/choreographyDiagram';

interface ChoreographyDiagramParams {
	textDocument: { uri: string };
	position: vscode.Position;
}

export function diagramPanelState(
	result: string | null, helperExpansionDepth = 0
): PanelState {
	return result === null
		? { kind: 'empty', message: 'Select a Choral choreography to visualize.' }
		: { kind: 'diagram', mermaid: result, helperExpansionDepth };
}

export function registerChoreographyVisualization(
	context: vscode.ExtensionContext,
	client: LanguageClient
): void {
	const panel = new ChoreographyPanel(context.extensionUri);
	let refreshVersion = 0;
	let selectionTimer: ReturnType<typeof setTimeout> | undefined;

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
			const result = await client.sendRequest<string | null>(DIAGRAM_REQUEST, params);
			if (requestVersion !== refreshVersion || !panel.isVisible()) {
				return;
			}
			panel.show(diagramPanelState(result));
		} catch (error) {
			if (requestVersion !== refreshVersion || !panel.isVisible()) {
				return;
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			panel.show({
				kind: 'error',
				message: `Unable to analyze choreography: ${errorMessage}`,
			});
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
}
