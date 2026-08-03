import * as crypto from 'crypto';
import * as vscode from 'vscode';

export type PanelState =
	| { kind: 'empty'; message: string }
	| { kind: 'diagram'; mermaid: string; staleMessage?: string }
	| { kind: 'error'; message: string };

export function toPanelMessage(state: PanelState): object {
	if (state.kind === 'diagram') {
		return {
			type: 'diagram',
			mermaid: state.mermaid,
			title: 'Choral Choreography',
			staleMessage: state.staleMessage,
		};
	}
	return { type: state.kind, message: state.message };
}

export class ChoreographyPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
	readonly onDidDispose = this.onDidDisposeEmitter.event;

	constructor(private readonly extensionUri: vscode.Uri) { }

	reveal(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}
		this.panel = vscode.window.createWebviewPanel(
			'choral.choreography',
			'Choral Choreography',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.extensionUri],
			}
		);
		this.panel.webview.html = this.html(this.panel.webview);
		this.panel.onDidDispose(() => {
			this.panel = undefined;
			this.onDidDisposeEmitter.fire();
		});
	}

	show(state: PanelState): void {
		if (!this.panel) {
			return;
		}
		void this.panel.webview.postMessage(toPanelMessage(state));
	}

	isVisible(): boolean {
		return this.panel?.visible === true;
	}

	dispose(): void {
		this.onDidDisposeEmitter.dispose();
		this.panel?.dispose();
	}

	private html(webview: vscode.Webview): string {
		const nonce = crypto.randomBytes(16).toString('base64');
		const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.extensionUri,
			'node_modules',
			'mermaid',
			'dist',
			'mermaid.esm.min.mjs'
		));
		return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
		<title>Choral Choreography</title>
		<style>
			html,
			body {
				height: 100%;
			}
			body {
				color: var(--vscode-foreground);
				background: var(--vscode-editor-background);
				font-family: var(--vscode-font-family);
				margin: 0;
				display: flex;
				flex-direction: column;
				overflow: hidden;
			}
			#status {
				flex: none;
				padding: 12px 16px;
				color: var(--vscode-descriptionForeground);
			}
			#status.error {
				color: var(--vscode-errorForeground);
			}
			#diagram {
				box-sizing: border-box;
				flex: 1;
				min-height: 0;
				overflow: auto;
				padding: 8px 16px 24px;
			}
			#diagram svg {
				display: block;
				width: auto;
				height: auto;
				max-width: none;
				max-height: none;
			}
		</style>
	</head>
	<body>
		<div id="status">Select a Choral choreography to visualize.</div>
		<div id="diagram" aria-live="polite"></div>
		<script nonce="${nonce}" type="module">
			import mermaid from '${mermaidUri}';

			const status = document.getElementById('status');
			const container = document.getElementById('diagram');
			let renderVersion = 0;
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: 'base',
				sequence: {
					useMaxWidth: false,
				},
				themeVariables: {
					actorBorder: 'var(--vscode-editorWidget-border, var(--vscode-editor-foreground))',
					actorBkg: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
					actorTextColor: 'var(--vscode-editor-foreground)',
					actorLineColor: 'var(--vscode-descriptionForeground)',
					signalColor: 'var(--vscode-editor-foreground)',
					signalTextColor: 'var(--vscode-editor-foreground)',
					labelBoxBorderColor: 'var(--vscode-editorWidget-border, var(--vscode-editor-foreground))',
					labelBoxBkgColor: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
					labelTextColor: 'var(--vscode-editor-foreground)',
					loopTextColor: 'var(--vscode-editor-foreground)',
					noteBorderColor: 'var(--vscode-editorWidget-border, var(--vscode-editor-foreground))',
					noteBkgColor: 'var(--vscode-editorWidget-background, var(--vscode-editor-background))',
					noteTextColor: 'var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground))',
					activationBorderColor: 'var(--vscode-editor-foreground)',
					activationBkgColor: 'var(--vscode-editor-inactiveSelectionBackground)',
					sequenceNumberColor: 'var(--vscode-editor-foreground)',
				},
			});

			window.addEventListener('message', async (event) => {
				const message = event.data;
				if (message.type === 'empty' || message.type === 'error') {
					renderVersion++;
					container.replaceChildren();
					status.textContent = message.message;
					status.className = message.type === 'error' ? 'error' : '';
					return;
				}
				if (message.type !== 'diagram') {
					return;
				}

				status.textContent = message.staleMessage || message.title;
				status.className = message.staleMessage ? 'error' : '';
				const currentRender = ++renderVersion;
				try {
					const result = await mermaid.render(
						'choral-diagram-' + currentRender,
						message.mermaid
					);
					if (currentRender !== renderVersion) {
						return;
					}
					container.innerHTML = result.svg;
				} catch (error) {
					if (currentRender !== renderVersion) {
						return;
					}
					container.replaceChildren();
					status.textContent = 'Unable to render choreography: '
						+ (error instanceof Error ? error.message : String(error));
					status.className = 'error';
				}
			});
		</script>
	</body>
</html>`;
	}
}
