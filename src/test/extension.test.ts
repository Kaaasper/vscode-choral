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

import { ChoreographyDiagram, toMermaidSequenceDiagram } from '../choreography';

describe('Choreography Mermaid conversion', () => {
	const range = new vscode.Range(0, 0, 0, 1);

	it('renders messages, selections, and nested control flow', () => {
		const diagram: ChoreographyDiagram = {
			version: 1,
			symbol: { name: 'Order@(Buyer, Seller)', range },
			participants: [{ id: 'Buyer', label: 'Buyer' }, { id: 'Seller', label: 'Seller' }],
			events: [
				{ kind: 'message', from: 'Buyer', to: 'Seller', label: 'order: Item', range },
				{ kind: 'alt', label: 'accepted', range, branches: [
					{ label: 'yes', events: [{ kind: 'selection', from: 'Seller', to: 'Buyer', label: 'Accepted', range }] },
					{ label: 'no', events: [{ kind: 'loop', label: 'retry', range, events: [{ kind: 'message', from: 'Buyer', to: 'Seller', label: 'order', range }] }] },
				] },
			],
		};

		assert.strictEqual(toMermaidSequenceDiagram(diagram), [
			'sequenceDiagram',
			'participant p_Buyer as Buyer',
			'participant p_Seller as Seller',
			'p_Buyer->>p_Seller: order  Item',
			'alt yes',
			'\tp_Seller-->>p_Buyer: Accepted',
			'else no',
			'\tloop retry',
			'\t\tp_Buyer->>p_Seller: order',
			'\tend',
			'end',
		].join('\n'));
	});
});
