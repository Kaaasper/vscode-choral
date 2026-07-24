import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';


describe('Choral Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	after(() => { vscode.window.showInformationMessage('All tests run'); });

	it('Choral Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

import { getDiagramError, getDiagramResponseError, isChoreographyDiagram, RenderedChoreographyDiagram, supportsChoreographyDiagram } from '../choreography';
import { toPanelMessage } from '../choreographyPanel';

describe('Choreography diagram response', () => {
	it('accepts the version 2 Mermaid response', () => {
		const diagram: RenderedChoreographyDiagram = {
			version: 2,
			format: 'mermaid',
			source: 'sequenceDiagram\np_Buyer->>p_Seller: order',
		};

		assert.strictEqual(isChoreographyDiagram(diagram), true);
	});

	it('rejects incompatible or malformed responses', () => {
		const oldVersion = { version: 1, format: 'mermaid', source: 'sequenceDiagram' };
		const unsupportedFormat = { version: 2, format: 'dot', source: 'digraph {}' };
		const malformed = { version: 2, format: 'mermaid', source: 42 };
		assert.strictEqual(isChoreographyDiagram(oldVersion), false);
		assert.strictEqual(getDiagramResponseError(oldVersion), 'The Choral language server returned unsupported choreography diagram response version 1. Expected version 2.');
		assert.strictEqual(isChoreographyDiagram(unsupportedFormat), false);
		assert.strictEqual(getDiagramResponseError(unsupportedFormat), 'The Choral language server returned unsupported choreography diagram format "dot". Expected "mermaid".');
		assert.strictEqual(isChoreographyDiagram(malformed), false);
		assert.strictEqual(getDiagramResponseError(malformed), 'The Choral language server returned an invalid Mermaid choreography diagram response.');
		assert.strictEqual(isChoreographyDiagram(null), false);
	});

	it('preserves structured server errors', () => {
		const response = { error: { message: 'No choreography symbol was found at the cursor.', code: 'not-found' } };
		assert.strictEqual(getDiagramError(response), 'No choreography symbol was found at the cursor.');
	});

	it('requires version 2 and Mermaid in the advertised formats', () => {
		assert.strictEqual(supportsChoreographyDiagram({ version: 2, formats: ['mermaid'] }), true);
		assert.strictEqual(supportsChoreographyDiagram({ version: 1, formats: ['mermaid'] }), false);
		assert.strictEqual(supportsChoreographyDiagram({ version: 2, formats: ['dot'] }), false);
		assert.strictEqual(supportsChoreographyDiagram({ version: 2 }), false);
	});

	it('passes the compiler-rendered Mermaid source to the panel unchanged', () => {
		const source = 'sequenceDiagram\np_Buyer->>p_Seller: order: {Item};';
		const diagram: RenderedChoreographyDiagram = { version: 2, format: 'mermaid', source };

		assert.deepStrictEqual(toPanelMessage({ kind: 'diagram', diagram }), {
			type: 'diagram',
			mermaid: source,
			title: 'Choral Choreography',
			staleMessage: undefined,
		});
	});
});
