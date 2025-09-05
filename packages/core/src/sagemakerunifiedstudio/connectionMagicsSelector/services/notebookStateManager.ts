/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CellState, ProjectOption } from '../models/types'
import { connectionOptionsService } from './connectionOptionsService'
import { getLogger } from '../../../shared/logger/logger'
import { magicCommandToConnectionMap, defaultProjectsByConnection, Constants } from '../models/constants'

/**
 * State manager for tracking notebook cell states and selections
 */
class NotebookStateManager {
    private cellStates: Map<string, CellState> = new Map()

    constructor() {}

    /**
     * Gets the cell state for a specific cell
     */
    private getCellState(cell: vscode.NotebookCell): CellState {
        const cellId = cell.document.uri.toString()
        if (!this.cellStates.has(cellId)) {
            this.cellStates.set(cellId, {})
        }
        return this.cellStates.get(cellId)!
    }

    /**
     * Sets metadata on a cell
     */
    private async setCellMetadata(cell: vscode.NotebookCell, key: string, value: any): Promise<void> {
        try {
            const edit = new vscode.WorkspaceEdit()
            const notebookEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, {
                ...cell.metadata,
                [key]: value,
            })
            edit.set(cell.notebook.uri, [notebookEdit])
            await vscode.workspace.applyEdit(edit)
        } catch (error) {
            getLogger().warn('setCellMetadata: Failed to set metadata, falling back to in-memory storage')
        }
    }

    /**
     * Gets the selected connection for a cell
     */
    public getSelectedConnection(cell: vscode.NotebookCell): string | undefined {
        const connection = cell.metadata?.[Constants.SAGEMAKER_CONNECTION_METADATA_KEY] as string
        if (connection) {
            return connection
        }

        const state = this.getCellState(cell)
        const currentCellContent = cell.document.getText()

        if (!state.connection || (!state.isUserSelection && state.lastParsedContent !== currentCellContent)) {
            this.parseCellMagic(cell)
            const updatedState = this.getCellState(cell)
            updatedState.lastParsedContent = currentCellContent

            return updatedState.connection
        }

        return state.connection
    }

    /**
     * Sets the selected connection for a cell
     */
    public setSelectedConnection(
        cell: vscode.NotebookCell,
        value: string | undefined,
        isUserSelection: boolean = false
    ): void {
        const state = this.getCellState(cell)
        const previousConnection = state.connection
        state.connection = value

        if (isUserSelection) {
            state.isUserSelection = true

            if (value) {
                void this.setCellMetadata(cell, Constants.SAGEMAKER_CONNECTION_METADATA_KEY, value)
            }
        }

        if (value === Constants.LOCAL_PYTHON || value === undefined) {
            if (value === Constants.LOCAL_PYTHON && previousConnection !== value) {
                state.project = undefined
                this.setDefaultProjectForConnection(cell, Constants.LOCAL_PYTHON)
            } else if (value === Constants.LOCAL_PYTHON && previousConnection === value) {
                if (!state.project) {
                    this.setDefaultProjectForConnection(cell, Constants.LOCAL_PYTHON)
                }
            } else {
                state.project = undefined
            }
        } else if (previousConnection !== value) {
            state.project = undefined
            this.setDefaultProjectForConnection(cell, value)
        }
    }

    /**
     * Gets the selected project for a cell
     */
    public getSelectedProject(cell: vscode.NotebookCell): string | undefined {
        return this.getCellState(cell).project
    }

    /**
     * Sets the selected project for a cell
     */
    public setSelectedProject(cell: vscode.NotebookCell, value: string | undefined): void {
        const state = this.getCellState(cell)
        state.project = value
    }

    /**
     * Gets the magic command for a cell using simplified format for UI operations
     */
    public getMagicCommand(cell: vscode.NotebookCell): string | undefined {
        const connection = this.getSelectedConnection(cell)
        if (!connection) {
            return
        }

        if (connection === Constants.LOCAL_PYTHON) {
            const state = this.getCellState(cell)
            const hasLocalMagic = state.originalMagicCommand?.startsWith(Constants.LOCAL_MAGIC)

            if (!hasLocalMagic) {
                return undefined
            }
        }

        const connectionOptions = connectionOptionsService.getConnectionOptionsSync()

        const connectionOption = connectionOptions.find((option) => option.label === connection)
        if (!connectionOption) {
            return undefined
        }

        const project = this.getSelectedProject(cell)

        if (!project) {
            return connectionOption.magic
        }

        return `${connectionOption.magic} ${project}`
    }

    /**
     * Parses a cell's content to detect magic commands and updates the state manager
     * @param cell The notebook cell to parse
     */
    public parseCellMagic(cell: vscode.NotebookCell): void {
        if (
            !cell ||
            cell.kind !== vscode.NotebookCellKind.Code ||
            cell.document.languageId === Constants.MARKDOWN_LANGUAGE
        ) {
            return
        }

        const state = this.getCellState(cell)
        if (state.isUserSelection) {
            return
        }

        const cellText = cell.document.getText()
        const lines = cellText.split('\n')

        const firstLine = lines[0].trim()
        if (!firstLine.startsWith(Constants.MAGIC_PREFIX)) {
            this.setSelectedConnection(cell, Constants.LOCAL_PYTHON)
            return
        }

        const parsed = this.parseMagicCommandLine(firstLine)
        if (!parsed) {
            return
        }

        const connectionType = magicCommandToConnectionMap[parsed.magic]
        if (!connectionType) {
            this.setSelectedConnection(cell, Constants.LOCAL_PYTHON)
            this.setDefaultProjectForConnection(cell, Constants.LOCAL_PYTHON)
            return
        }

        const cellState = this.getCellState(cell)
        cellState.originalMagicCommand = firstLine

        this.setSelectedConnection(cell, connectionType)

        if (parsed.project) {
            this.setSelectedProject(cell, parsed.project)
        } else {
            this.setDefaultProjectForConnection(cell, connectionType)
        }
    }

    /**
     * Parses a magic command line to extract magic and project parameters
     * Supports formats: %%magic, %%magic project, %%magic --name project, %%magic -n project
     */
    private parseMagicCommandLine(line: string): { magic: string; project?: string } | undefined {
        const tokens = line.split(/\s+/)
        if (tokens.length === 0 || !tokens[0].startsWith(Constants.MAGIC_PREFIX)) {
            return undefined
        }

        const magic = tokens[0]
        let project: string | undefined

        if (tokens.length === 2) {
            // Format: %%magic project
            project = tokens[1]
        } else if (tokens.length >= 3) {
            // Format: %%magic --name project or %%magic -n project
            const flagIndex = tokens.findIndex(
                (token) => token === Constants.NAME_FLAG_LONG || token === Constants.NAME_FLAG_SHORT
            )
            if (flagIndex !== -1 && flagIndex + 1 < tokens.length) {
                project = tokens[flagIndex + 1]
            }
        }

        return { magic, project }
    }

    /**
     * Sets default project for a connection when no explicit project is specified
     */
    private setDefaultProjectForConnection(cell: vscode.NotebookCell, connectionType: string): void {
        const projectOptions = connectionOptionsService.getProjectOptionsSync()

        const mapping = projectOptions.find((option) => option.connection === connectionType)
        if (!mapping || mapping.projectOptions.length === 0) {
            return
        }

        const defaultProjects = defaultProjectsByConnection[connectionType] || []

        for (const defaultProject of defaultProjects) {
            for (const projectOption of mapping.projectOptions) {
                if (projectOption.projects.includes(defaultProject)) {
                    this.setSelectedProject(cell, defaultProject)
                    return
                }
            }
        }

        const firstProjectOption = mapping.projectOptions[0]
        if (firstProjectOption.projects.length > 0) {
            this.setSelectedProject(cell, firstProjectOption.projects[0])
        }
    }

    /**
     * Updates the current cell with the magic command and sets the cell language
     * @param cell The notebook cell to update
     */
    public async updateCellWithMagic(cell: vscode.NotebookCell): Promise<void> {
        const connection = this.getSelectedConnection(cell)
        if (!connection) {
            return
        }

        const connectionOptions = connectionOptionsService.getConnectionOptionsSync()
        const connectionOption = connectionOptions.find((option) => option.label === connection)
        if (!connectionOption) {
            return
        }

        try {
            await vscode.languages.setTextDocumentLanguage(cell.document, connectionOption.language)

            const cellText = cell.document.getText()
            const lines = cellText.split('\n')
            const firstLine = lines[0] || ''
            const isMagicCommand = firstLine.trim().startsWith(Constants.MAGIC_PREFIX)

            let newCellContent = cellText

            if (connection === Constants.LOCAL_PYTHON) {
                const state = this.getCellState(cell)
                const hasLocalMagic = state.originalMagicCommand?.startsWith(Constants.LOCAL_MAGIC)

                if (hasLocalMagic) {
                    const magicCommand = this.getMagicCommand(cell)
                    if (magicCommand) {
                        if (isMagicCommand) {
                            newCellContent = magicCommand + '\n' + lines.slice(1).join('\n')
                        } else {
                            newCellContent = magicCommand + '\n' + cellText
                        }
                    }
                } else {
                    if (isMagicCommand) {
                        newCellContent = lines.slice(1).join('\n')
                    }
                }
            } else {
                const magicCommand = this.getMagicCommand(cell)

                if (magicCommand) {
                    if (!magicCommand.startsWith(Constants.MAGIC_PREFIX)) {
                        return
                    }

                    if (isMagicCommand) {
                        newCellContent = magicCommand + '\n' + lines.slice(1).join('\n')
                    } else {
                        newCellContent = magicCommand + '\n' + cellText
                    }
                }
            }

            if (newCellContent !== cellText) {
                await this.updateCellContent(cell, newCellContent)
            }
        } catch (error) {
            getLogger().error(`Error updating cell with magic command: ${error}`)
        }
    }

    /**
     * Updates the content of a notebook cell using the most appropriate API for the environment
     * @param cell The notebook cell to update
     * @param newContent The new content for the cell
     */
    private async updateCellContent(cell: vscode.NotebookCell, newContent: string): Promise<void> {
        try {
            if (vscode.workspace.applyEdit && (vscode as any).NotebookEdit) {
                const edit = new vscode.WorkspaceEdit()
                const notebookUri = cell.notebook.uri
                const cellIndex = cell.index

                const newCellData = new vscode.NotebookCellData(cell.kind, newContent, cell.document.languageId)

                const notebookEdit = (vscode as any).NotebookEdit.replaceCells(
                    new vscode.NotebookRange(cellIndex, cellIndex + 1),
                    [newCellData]
                )
                edit.set(notebookUri, [notebookEdit])

                const success = await vscode.workspace.applyEdit(edit)
                if (success) {
                    return
                }
            }
        } catch (error) {
            getLogger().error(`NotebookEdit failed, attempting to update cell content with WorkspaceEdit: ${error}`)
        }

        try {
            const edit = new vscode.WorkspaceEdit()

            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(cell.document.lineCount, 0)
            )

            edit.replace(cell.document.uri, fullRange, newContent)

            const success = await vscode.workspace.applyEdit(edit)
            if (!success) {
                getLogger().error('WorkspaceEdit failed to apply')
            }
        } catch (error) {
            getLogger().error(`Failed to update cell content with WorkspaceEdit: ${error}`)

            try {
                const document = cell.document
                if (document && 'getText' in document && 'uri' in document) {
                    const edit = new vscode.WorkspaceEdit()
                    const fullText = document.getText()
                    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(fullText.length))
                    edit.replace(document.uri, fullRange, newContent)
                    await vscode.workspace.applyEdit(edit)
                }
            } catch (finalError) {
                getLogger().error(`All cell update methods failed: ${finalError}`)
            }
        }
    }

    /**
     * Gets the project options for the selected connection in a cell
     */
    public getProjectOptionsForConnection(cell: vscode.NotebookCell): ProjectOption[] {
        const connection = this.getSelectedConnection(cell)
        if (!connection) {
            return []
        }

        const projectOptions = connectionOptionsService.getProjectOptionsSync()
        const mapping = projectOptions.find((option) => option.connection === connection)
        if (!mapping) {
            return []
        }

        const options: ProjectOption[] = []
        for (const projectOption of mapping.projectOptions) {
            for (const project of projectOption.projects) {
                options.push({ connection: projectOption.connection, project: project })
            }
        }

        return options
    }
}

export const notebookStateManager = new NotebookStateManager()
