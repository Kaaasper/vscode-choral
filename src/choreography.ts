import * as vscode from 'vscode';

export interface ChoreographyDiagram {
	version: 1;
	symbol: { name: string; range: vscode.Range };
	participants: ChoreographyParticipant[];
	events: ChoreographyEvent[];
}

export interface ChoreographyParticipant { id: string; label: string; }
export interface ChoreographyMessage { kind: 'message' | 'selection'; from: string; to: string; label: string; range: vscode.Range; }
export interface ChoreographyGroup { kind: 'alt' | 'opt' | 'loop'; label: string; branches?: ChoreographyBranch[]; events?: ChoreographyEvent[]; range: vscode.Range; }
export interface ChoreographyBranch { label: string; events: ChoreographyEvent[]; }
export type ChoreographyEvent = ChoreographyMessage | ChoreographyGroup;
export interface ChoreographyDiagramError { error: { message: string; code?: string }; }
export interface ChoreographyDiagramParams { textDocument: { uri: string }; position: vscode.Position; }

export function isChoreographyDiagram(value: unknown): value is ChoreographyDiagram {
	return typeof value === 'object' && value !== null && (value as ChoreographyDiagram).version === 1 &&
		Array.isArray((value as ChoreographyDiagram).participants) && Array.isArray((value as ChoreographyDiagram).events);
}

export function getDiagramError(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || !('error' in value)) { return undefined; }
	const error = (value as ChoreographyDiagramError).error;
	return typeof error?.message === 'string' ? error.message : undefined;
}

export function toMermaidSequenceDiagram(diagram: ChoreographyDiagram): string {
	const lines = ['sequenceDiagram'];
	for (const participant of diagram.participants) { lines.push(`participant ${participantId(participant.id)} as ${escapeMermaid(participant.label)}`); }
	renderEvents(lines, diagram.events, '');
	return lines.join('\n');
}

function renderEvents(lines: string[], events: ChoreographyEvent[], indentation: string): void {
	for (const event of events) {
		if (event.kind === 'message' || event.kind === 'selection') {
			lines.push(`${indentation}${participantId(event.from)}${event.kind === 'selection' ? '-->>' : '->>'}${participantId(event.to)}: ${escapeMermaid(event.label)}`);
			continue;
		}
		if (event.kind === 'alt') {
			const branches = event.branches ?? [];
			branches.forEach((branch, index) => { lines.push(`${indentation}${index === 0 ? 'alt' : 'else'} ${escapeMermaid(branch.label)}`); renderEvents(lines, branch.events, `${indentation}\t`); });
			if (branches.length === 0) { lines.push(`${indentation}alt ${escapeMermaid(event.label)}`); }
			lines.push(`${indentation}end`);
			continue;
		}
		const group = event as ChoreographyGroup;
		lines.push(`${indentation}${group.kind} ${escapeMermaid(group.label)}`);
		renderEvents(lines, group.events ?? [], `${indentation}\t`);
		lines.push(`${indentation}end`);
	}
}

function participantId(value: string): string { return `p_${value.replace(/[^A-Za-z0-9_]/g, '_')}`; }
function escapeMermaid(value: string): string { return value.replace(/[\n\r]+/g, ' ').replace(/[:{};]/g, ' ').trim() || ' '; }
