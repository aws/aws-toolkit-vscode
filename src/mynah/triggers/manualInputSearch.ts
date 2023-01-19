/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter, ExtensionContext, commands, window } from 'vscode'
import { NotificationType, showNotification } from '../utils/notify'
import { v4 as uuid } from 'uuid'
import { extractContext } from '../utils/context-extraction'
import { Java, Python, TypeScript, Tsx, Extent, Location } from '@aws/fully-qualified-names'
import { SearchPayloadCodeSelection } from '@aws/mynah-ui'
import { NotificationInfoStore } from '../stores/notificationsInfoStore'
import * as vs from 'vscode'
import { mynahSelectedCodeDecorator } from '../decorations/selectedCode'
import { StatusBar } from '../utils/status-bar'
import { CodeQuery, Query, QueryContext, SearchInput, Trigger } from '../models/model'
import { TelemetryClientSession } from '../telemetry/telemetry/client'
import { telemetry } from '../../shared/telemetry/telemetry'

export class ManualInputSearch extends SearchInput {
    private apiHelpStatusBar!: StatusBar | undefined
    private readonly notificationInfoStore: NotificationInfoStore
    private readonly muteNotificationButtonText = 'Do not show again'
    readonly apiHelpGuideNotificationName = 'api_help_guide'

    private readonly supportedLanguages = new Set<string>([
        'java',
        'javascript',
        'javascriptreact',
        'typescriptreact',
        'python',
        'typescript',
    ])

    constructor(
        context: ExtensionContext,
        readonly queryEmitter: EventEmitter<Query>,
        readonly telemetrySession: TelemetryClientSession
    ) {
        super()
        this.notificationInfoStore = new NotificationInfoStore(context.globalState, context.workspaceState)
    }

    public activate(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand('Mynah.show', async parameters => {
                let range: vs.Range
                if (parameters && parameters.range) {
                    range = new vs.Range(parameters.range[0], parameters.range[1])
                }
                return await this.show(range!)
            })
        )

        // Adds hover subscription
        context.subscriptions.push(
            vs.languages.registerHoverProvider(Array.from(this.supportedLanguages), {
                provideHover: async (document, position): Promise<vs.Hover> => {
                    let hover: vs.Hover
                    const hoveredWordRange = document.getWordRangeAtPosition(position)

                    //Checks target word has FQNs
                    if (await this.checkIfSelectionHasFQNs(hoveredWordRange)) {
                        // Mynah.show command arguments to simulate a code selection with hover
                        const args = [{ range: hoveredWordRange, isFromHover: true }]
                        const contents = new vs.MarkdownString(
                            `[Find real world examples for **${document.getText(
                                hoveredWordRange
                            )}** with Mynah](${vs.Uri.parse(
                                `command:Mynah.show?${encodeURIComponent(JSON.stringify(args))}`
                            )})`
                        )
                        contents.isTrusted = true
                        hover = new vs.Hover(contents)
                        return hover
                    } else {
                        return hover!
                    }
                },
            })
        )

        vs.window.onDidChangeTextEditorSelection(async event => {
            if (await this.checkIfSelectionHasFQNs()) {
                this.apiHelpStatusBar = new StatusBar({
                    text: 'Show similar examples with Mynah',
                    commands: { Examples: 'Mynah.show' },
                })
            }
        })
    }

    private async checkIfSelectionHasFQNs(customRangeInDocument?: vs.Range): Promise<boolean> {
        const codeQuery = await this.extractCodeQuery(false, true, customRangeInDocument)

        if (this.apiHelpStatusBar !== undefined) {
            this.apiHelpStatusBar?.destroy()
            this.apiHelpStatusBar = undefined
        }

        return codeQuery !== undefined && codeQuery.usedFullyQualifiedNames.length > 0
    }

    // TODO: Refine this interface. This method likely doesn't belong in this
    // class given that this is facade over the VSCode search input.
    //
    // The search bar value can be kept up-to-date even if we decouple the ability
    // to trigger a new search from the input updating mechanism.
    // (possibly use events)
    public async searchText(
        newInput: string,
        queryContext: QueryContext = { must: new Set<string>(), should: new Set<string>(), mustNot: new Set<string>() },
        code?: string,
        queryId?: string,
        codeQuery?: CodeQuery,
        codeSelection?: SearchPayloadCodeSelection
    ): Promise<void> {
        this.queryEmitter.fire({
            input: newInput,
            queryContext,
            code,
            queryId: queryId ?? uuid(),
            trigger: 'SearchBarRefinement' as Trigger,
            codeQuery,
            codeSelection,
        })
    }

    public async show(customRangeInDocument?: vs.Range): Promise<void> {
        const selectedCode = customRangeInDocument
            ? window.activeTextEditor?.document.getText(customRangeInDocument)
            : this.getSelectedCodeFromEditor()
        const isCodeSelected = selectedCode !== undefined && selectedCode !== ''

        let hasUnsupportedLanguage = false
        if (isCodeSelected && !this.supportedLanguages.has(this.getDocumentLanguage())) {
            hasUnsupportedLanguage = true
            await this.createNotificationAboutUnsupportedLanguage()
        }

        let hasCodeQuery = false
        const codeQuery = await this.extractCodeQuery(true, false, customRangeInDocument)
        if (isCodeSelected && !hasUnsupportedLanguage && codeQuery !== undefined) {
            hasCodeQuery = true
        }

        try {
            this.turnOffAllEditorDecorations()
            this.queryEmitter.fire({
                input: '',
                queryContext: await extractContext(isCodeSelected),
                queryId: uuid(),
                trigger: isCodeSelected ? ('CodeSelection' as Trigger) : ('SearchBarInput' as Trigger),
                codeQuery: !hasCodeQuery
                    ? {
                          simpleNames: [],
                          usedFullyQualifiedNames: [],
                      }
                    : codeQuery,
                codeSelection: !hasCodeQuery
                    ? {
                          selectedCode: '',
                          file: {
                              range: {
                                  start: { row: '', column: '' },
                                  end: { row: '', column: '' },
                              },
                              name: '',
                          },
                      }
                    : this.extractCodeSelection(customRangeInDocument),
            })
            await this.notificationInfoStore.setMuteStatusForNotificationInGlobalStore(
                this.apiHelpGuideNotificationName,
                true
            )
        } catch (err: any) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            console.error(`Query was incorrect because ${err.message}.`)
            await this.show()
        }
    }

    private async createNotificationAboutUnsupportedLanguage(): Promise<void> {
        const notificationName = 'api_help_unsupported_languages'
        const notificationInfo = await this.notificationInfoStore.getRecordFromGlobalStore(notificationName)

        if (notificationInfo === undefined || !notificationInfo.muted) {
            telemetry.mynah_viewNotification.emit({
                mynahContext: JSON.stringify({
                    notificationMetadata: {
                        name: notificationName,
                    },
                }),
            })

            await vs.window
                .showInformationMessage(
                    "Currently we only support java, javascript, typescript and python. We'll let you know when we have more supported languages.",
                    this.muteNotificationButtonText
                )
                .then(async selection => {
                    if (selection !== undefined) {
                        await this.notificationInfoStore.setMuteStatusForNotificationInGlobalStore(
                            notificationName,
                            true
                        )
                        telemetry.mynah_actOnNotification.emit({
                            mynahContext: JSON.stringify({
                                notificationMetadata: {
                                    name: notificationName,
                                    action: this.muteNotificationButtonText,
                                },
                            }),
                        })
                    }
                })

            await this.notificationInfoStore.addNewViewToNotificationInGlobalStore(notificationName)
        }
    }

    private turnOffAllEditorDecorations(): void {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return
        }

        editor.setDecorations(mynahSelectedCodeDecorator, [])
    }

    private getSelectedCodeFromEditor(customRangeInDocument?: vs.Range): string | undefined {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return undefined
        }

        if (editor.document === undefined) {
            return undefined
        }

        return editor.document.getText(customRangeInDocument ?? editor.selection)
    }

    private extractCodeSelection(customRangeInDocument?: vs.Range): SearchPayloadCodeSelection {
        const editor = window.activeTextEditor
        const emptySelection = {
            selectedCode: '',
            file: {
                range: {
                    start: { row: '', column: '' },
                    end: { row: '', column: '' },
                },
                name: '',
            },
        }
        if (editor === undefined) {
            return emptySelection
        }

        if (editor.document === undefined) {
            return emptySelection
        }

        const selection: any = editor.selection
        let selectedCode: any = editor.document.getText(customRangeInDocument ?? selection)
        let range: any = customRangeInDocument ?? selection
        if (selectedCode === '') {
            // If there is no selection then pick the line where the cursor is
            range = editor.document.lineAt(selection.active.line).range
            selectedCode = editor.document.lineAt(selection.active.line).text
        }

        return {
            selectedCode,
            file: {
                range: {
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    start: { row: range.start.line + 1, column: range.start.character + 1 },
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    end: { row: range.end.line + 1, column: range.end.character + 1 },
                },
                name: editor.document.fileName,
            },
        }
    }

    private async getSimpleAndFqnNames(customRangeInDocument?: vs.Range): Promise<any> {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return undefined
        }

        if (editor.document === undefined) {
            return undefined
        }

        const languageId = editor.document.languageId

        const fileText: any = editor.document
            .getText()
            .replace(/([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g, '')
        const selection: any = editor.selection
        const selectedCode: any = editor.document.getText(customRangeInDocument ?? selection)
        let range: any = customRangeInDocument ?? selection
        if (selectedCode === '') {
            // If there is no selection then pick the line where the cursor is
            range = editor.document.lineAt(selection.active.line).range
        }

        const startLocation: Location = new Location(range.start.line, range.start.character)
        const endLocation: Location = new Location(range.end.line, range.end.character)
        const extent: Extent = new Extent(startLocation, endLocation)

        let names: any = {}
        switch (languageId) {
            case 'java':
                names = await Java.findNamesWithInExtent(fileText, extent)
                break
            case 'javascript':
            case 'javascriptreact':
            case 'typescriptreact':
                names = await Tsx.findNamesWithInExtent(fileText, extent)
                break
            case 'python':
                names = await Python.findNamesWithInExtent(fileText, extent)
                break
            case 'typescript':
                names = await TypeScript.findNamesWithInExtent(fileText, extent)
                break
        }

        return names
    }

    private getDocumentLanguage(): string {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return ''
        }

        if (editor.document === undefined) {
            return ''
        }

        return editor.document.languageId
    }

    private prepareSimpleNames(names: any): [string[], boolean] {
        let simpleNames: string[] = names.simple.usedSymbols
            .concat(names.simple.declaredSymbols)
            .filter(function (elem: any) {
                const trimmedElem = elem.symbol.trim()
                return trimmedElem.length < 129 && trimmedElem.length > 1
            })
            .map(function (elem: any) {
                return elem.symbol.trim()
            })

        const maxSimpleNamesLength = 100

        let listWasLongerThanMaxLenght = false

        if (simpleNames.length > maxSimpleNamesLength) {
            listWasLongerThanMaxLenght = true

            simpleNames = [...new Set(simpleNames)]

            if (simpleNames.length > maxSimpleNamesLength) {
                simpleNames = simpleNames.sort((a, b) => a.length - b.length)
                simpleNames.splice(0, simpleNames.length - maxSimpleNamesLength)
            }
        }

        return [simpleNames, listWasLongerThanMaxLenght]
    }

    private prepareFqns(names: any): { usedFullyQualifiedNames: Set<string>; namesWereTruncated: boolean } {
        const identifierSeparator = '.'
        const usedFullyQualifiedNames: Set<string> = new Set(
            names.fullyQualified.usedSymbols
                .map((elem: any) => [...elem.source, ...elem.symbol].join(identifierSeparator))
                .filter((elem: any) => elem.length > 1 && elem.length < 512)
        )

        const maxUsedFullyQualifiedNamesLength = 25

        if (usedFullyQualifiedNames.size > maxUsedFullyQualifiedNamesLength) {
            const usedFullyQualifiedNamesSorted = Array.from(usedFullyQualifiedNames).sort(
                (name, other) => name.length - other.length
            )
            return {
                usedFullyQualifiedNames: new Set(
                    usedFullyQualifiedNamesSorted.slice(0, maxUsedFullyQualifiedNamesLength)
                ),
                namesWereTruncated: true,
            }
        }

        return { usedFullyQualifiedNames, namesWereTruncated: false }
    }

    private async extractCodeQuery(
        haveUserInput: boolean,
        skipNotifications?: boolean,
        customRangeInDocument?: vs.Range
    ): Promise<CodeQuery | undefined> {
        const names = await this.getSimpleAndFqnNames(customRangeInDocument)
        if (names === undefined || Object.keys(names).length === 0) {
            return undefined
        }

        const [simpleNames, simpleNamesListWasLongerThanMaxLength] = this.prepareSimpleNames(names)

        if (simpleNames.length === 0) {
            if (skipNotifications !== true && !haveUserInput) {
                showNotification(
                    NotificationType.ERROR,
                    'We are sorry that Mynah cannot provide suggestions from your selected code range. Please change your selection and try again.'
                )
            }
            return undefined
        }

        const { usedFullyQualifiedNames, namesWereTruncated } = this.prepareFqns(names)

        if (simpleNamesListWasLongerThanMaxLength || namesWereTruncated) {
            const notificationName = 'api_help_parameters_modification'
            const notificationInfo = await this.notificationInfoStore.getRecordFromGlobalStore(notificationName)

            if (skipNotifications !== true && (notificationInfo === undefined || !notificationInfo.muted)) {
                await vs.window
                    .showWarningMessage(
                        "We've shortened a few parameters from your selection to be able to perform your search. If the results are not relevant, please try to reduce your selection and perform a new search again.",
                        this.muteNotificationButtonText
                    )
                    .then(async selection => {
                        if (selection !== undefined) {
                            await this.notificationInfoStore.setMuteStatusForNotificationInGlobalStore(
                                notificationName,
                                true
                            )
                        }
                    })
                await this.notificationInfoStore.addNewViewToNotificationInGlobalStore(notificationName)
            }
        }

        return {
            simpleNames,
            usedFullyQualifiedNames: Array.from(usedFullyQualifiedNames),
        }
    }
}
