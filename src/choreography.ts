import * as vscode from 'vscode';

export const CHOREOGRAPHY_DIAGRAM_VERSION = 2;
export const CHOREOGRAPHY_DIAGRAM_FORMAT = 'mermaid';

export interface RenderedChoreographyDiagram {
	version: typeof CHOREOGRAPHY_DIAGRAM_VERSION;
	format: typeof CHOREOGRAPHY_DIAGRAM_FORMAT;
	source: string;
}

export interface ChoreographyDiagramError { error: { message: string; code?: string }; }
export interface ChoreographyDiagramParams { textDocument: { uri: string }; position: vscode.Position; format: typeof CHOREOGRAPHY_DIAGRAM_FORMAT; }

export function isChoreographyDiagram(value: unknown): value is RenderedChoreographyDiagram {
	return typeof value === 'object' && value !== null && (value as RenderedChoreographyDiagram).version === CHOREOGRAPHY_DIAGRAM_VERSION &&
		(value as RenderedChoreographyDiagram).format === CHOREOGRAPHY_DIAGRAM_FORMAT && typeof (value as RenderedChoreographyDiagram).source === 'string';
}

export function getDiagramError(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || !('error' in value)) { return undefined; }
	const error = (value as ChoreographyDiagramError).error;
	return typeof error?.message === 'string' ? error.message : undefined;
}

export function getDiagramResponseError(value: unknown): string {
	if (typeof value !== 'object' || value === null) { return 'The Choral language server returned an invalid choreography diagram response.'; }
	const response = value as { version?: unknown; format?: unknown; source?: unknown };
	if (response.version !== CHOREOGRAPHY_DIAGRAM_VERSION) {
		return typeof response.version === 'number'
			? `The Choral language server returned unsupported choreography diagram response version ${response.version}. Expected version ${CHOREOGRAPHY_DIAGRAM_VERSION}.`
			: 'The Choral language server returned a choreography diagram response without a valid version.';
	}
	if (response.format !== CHOREOGRAPHY_DIAGRAM_FORMAT) {
		return typeof response.format === 'string'
			? `The Choral language server returned unsupported choreography diagram format "${response.format}". Expected "${CHOREOGRAPHY_DIAGRAM_FORMAT}".`
			: 'The Choral language server returned a choreography diagram response without a valid format.';
	}
	return 'The Choral language server returned an invalid Mermaid choreography diagram response.';
}

export function supportsChoreographyDiagram(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) { return false; }
	const capability = value as { version?: unknown; formats?: unknown };
	return capability.version === CHOREOGRAPHY_DIAGRAM_VERSION && Array.isArray(capability.formats) &&
		capability.formats.includes(CHOREOGRAPHY_DIAGRAM_FORMAT);
}
