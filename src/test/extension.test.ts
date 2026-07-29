import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import { toPanelMessage } from '../choreographyPanel';


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
