import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import {
	executePanelCommand,
	PanelCommandActions,
	toPanelCommand,
	toPanelMessage,
} from '../choreographyPanel';


describe('Choral Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	after(() => { vscode.window.showInformationMessage('All tests run'); });

	it('Choral Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

describe('Choreography diagram response', () => {
	it('passes the compiler-rendered Mermaid source to the panel unchanged', () => {
		const source = 'sequenceDiagram\np_Buyer->>p_Seller: order: {Item};';

		assert.deepStrictEqual(toPanelMessage({ kind: 'diagram', mermaid: source }), {
			type: 'diagram',
			mermaid: source,
			title: 'Choral Choreography',
			staleMessage: undefined,
		});
	});
});

describe('Choreography panel commands', () => {
	it('copies Mermaid source without modifying it', async () => {
		const source = 'sequenceDiagram\n  p_A->>p_B: value: {exact};\n';
		let copied: string | undefined;
		const result = await executePanelCommand(
			{ type: 'copyMermaid', mermaid: source },
			actions({ copyMermaid: async value => { copied = value; } })
		);

		assert.strictEqual(result, 'copied');
		assert.strictEqual(copied, source);
	});

	it('writes the rendered SVG as unchanged UTF-8', async () => {
		const uri = vscode.Uri.file('/tmp/choreography.svg');
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Æ</text></svg>';
		let writtenUri: vscode.Uri | undefined;
		let writtenContent: Uint8Array | undefined;
		const result = await executePanelCommand(
			{ type: 'exportSvg', svg },
			actions({
				chooseSvgFile: async () => uri,
				writeFile: async (target, content) => {
					writtenUri = target;
					writtenContent = content;
				},
			})
		);

		assert.strictEqual(result, 'exported');
		assert.strictEqual(writtenUri?.toString(), uri.toString());
		assert.strictEqual(Buffer.from(writtenContent ?? []).toString('utf8'), svg);
	});

	it('does not write a file when export is cancelled', async () => {
		let writes = 0;
		const result = await executePanelCommand(
			{ type: 'exportSvg', svg: '<svg></svg>' },
			actions({ writeFile: async () => { writes++; } })
		);

		assert.strictEqual(result, 'cancelled');
		assert.strictEqual(writes, 0);
	});

	it('ignores malformed or non-SVG webview messages', async () => {
		assert.strictEqual(toPanelCommand({ type: 'copyMermaid', mermaid: 42 }), undefined);
		assert.strictEqual(toPanelCommand({ type: 'exportSvg', svg: '<html></html>' }), undefined);
		assert.strictEqual(
			await executePanelCommand({ type: 'unknown' }, actions()),
			'ignored'
		);
	});
});

function actions(overrides: Partial<PanelCommandActions> = {}): PanelCommandActions {
	return {
		copyMermaid: async () => undefined,
		chooseSvgFile: async () => undefined,
		writeFile: async () => undefined,
		...overrides,
	};
}
