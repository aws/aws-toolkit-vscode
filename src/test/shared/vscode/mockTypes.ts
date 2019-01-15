/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { types as vscode } from '../../../shared/vscode'
import { createMockEvent } from './utils'

export class MockBreakpoint implements vscode.Breakpoint {
    public readonly enabled: boolean
    public readonly condition?: string
    public readonly hitCondition?: string
    public readonly logMessage?: string

    protected constructor(
        enabled?: boolean,
        condition?: string,
        hitCondition?: string,
        logMessage?: string
    ) {
        this.enabled = enabled || false
        this.condition = condition || ''
        this.hitCondition = hitCondition || ''
        this.logMessage = logMessage || ''

    }
}

export class MockCancellationToken implements vscode.CancellationToken {
    public isCancellationRequested: boolean = false

    public onCancellationRequested: vscode.Event<any>

    private readonly onCancellationRequestedEmitter: MockEventEmitter<any>

    public constructor() {
        this.onCancellationRequestedEmitter = new MockEventEmitter<any>()
        this.onCancellationRequested = this.onCancellationRequestedEmitter.event.bind(
            this.onCancellationRequestedEmitter
        ) as vscode.Event<any>
    }
}

export class MockCancellationTokenSource implements vscode.CancellationTokenSource {
    public token: vscode.CancellationToken = new MockCancellationToken()

    public cancel(): void {
    }

    public dispose(): void {
    }
}

export class MockEventEmitter<T> implements vscode.EventEmitter<T> {
    private nextId: number = 0
    private readonly listeners: Map<
        number,
        {
            disposable: vscode.Disposable
            listener(e: T): any,
        }
    >

    public constructor() {
        this.listeners = new Map()
    }

    public event(
        listener: (e: T) => any,
        thisArgs?: any,
        disposables?: vscode.Disposable[]
    ): vscode.Disposable {
        if (!!thisArgs) {
            listener = listener.bind(thisArgs) as (e: T) => any
        }

        const id = this.nextId++
        const listenerConfig = {
            listener,
            disposable: {
                dispose: () => { this.listeners.delete(id) }
            }
        }
        this.listeners.set(id, listenerConfig)

        return listenerConfig.disposable
    }

    public fire(data?: T): void {
        for (const { listener } of this.listeners.values()) {
            listener(data || {} as any as T)
        }
    }

    public dispose(): void {
        for (const { disposable } of this.listeners.values()) {
            disposable.dispose()
        }

        this.listeners.clear()
    }
}

export class MockPosition implements vscode.Position {
    public constructor(
        public readonly line: number,
        public readonly character: number
    ) {
    }

    public isBefore(other: vscode.Position): boolean {
        throw new Error('Not Implemented')
    }

    public isBeforeOrEqual(other: vscode.Position): boolean {
        throw new Error('Not Implemented')
    }

    public isAfter(other: vscode.Position): boolean {
        throw new Error('Not Implemented')
    }

    public isAfterOrEqual(other: vscode.Position): boolean {
        throw new Error('Not Implemented')
    }

    public isEqual(other: vscode.Position): boolean {
        throw new Error('Not Implemented')
    }

    public compareTo(other: vscode.Position): number {
        throw new Error('Not Implemented')
    }

    public translate(lineDelta?: number, characterDelta?: number): vscode.Position
    public translate(change: { lineDelta?: number; characterDelta?: number; }): vscode.Position
    public translate(
        lineDeltaOrChange?: number | {
            lineDelta?: number
            characterDelta?: number
        },
        characterDelta?: number
    ): vscode.Position {
        throw new Error('Not Implemented')
    }

    public with(line?: number, character?: number): vscode.Position
    public with(change: { line?: number; character?: number; }): vscode.Position
    public with(
        lineOrChange?: number | {
            line?: number
            character?: number
        },
        character?: number
    ): vscode.Position {
        throw new Error('Not Implemented')
    }
}

export class MockProgress<T> implements vscode.Progress<T> {
    public report(value: T): void {
    }
}

export class MockRange implements vscode.Range {
    public readonly start: vscode.Position

    public readonly end: vscode.Position

    public isEmpty: boolean

    public isSingleLine: boolean

    public constructor(start: vscode.Position, end: vscode.Position)
    public constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number)
    public constructor(
        startOrStartLine: vscode.Position | number,
        endOrStartCharacter: vscode.Position | number,
        endLine?: number,
        endCharacter?: number
    ) {
        this.isEmpty = false
        this.isSingleLine = false

        if (typeof startOrStartLine !== 'number') {
            this.start = startOrStartLine as vscode.Position
            this.end = endOrStartCharacter as vscode.Position
        } else {
            this.start = new MockPosition(startOrStartLine as number, endOrStartCharacter as number)
            this.end = new MockPosition(endLine!, endCharacter!)
        }
    }

    public contains(positionOrRange: vscode.Position | vscode.Range): boolean {
        throw new Error('Not Implemented')
    }

    public isEqual(other: vscode.Range): boolean {
        throw new Error('Not Implemented')
    }

    public intersection(range: vscode.Range): vscode.Range | undefined {
        throw new Error('Not Implemented')
    }

    public union(other: vscode.Range): vscode.Range {
        throw new Error('Not Implemented')
    }

    public with(start?: vscode.Position, end?: vscode.Position): vscode.Range
    public with(change: { start?: vscode.Position, end?: vscode.Position }): vscode.Range
    public with(
        startOrChange?: vscode.Position | { start?: vscode.Position, end?: vscode.Position },
        end?: vscode.Position
    ): vscode.Range {
        throw new Error('Not Implemented')
    }
}

export class MockSelection extends MockRange implements vscode.Selection {
    public anchor: vscode.Position

    public active: vscode.Position

    public isReversed: boolean

    public constructor(anchor: vscode.Position, active: vscode.Position)
    public constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number)
    public constructor(
        anchorOrAnchorLine: vscode.Position | number,
        activeOrAnchorCharacter: vscode.Position | number,
        activeLine?: number,
        activeCharacter?: number
    ) {
        super(
            typeof anchorOrAnchorLine === 'number' ?
                new MockPosition(anchorOrAnchorLine as number, activeOrAnchorCharacter as number) :
                anchorOrAnchorLine as vscode.Position,
            typeof activeOrAnchorCharacter === 'number' ?
                new MockPosition(activeLine!, activeCharacter!) :
                activeOrAnchorCharacter as vscode.Position
        )
        this.isReversed = false

        if (typeof anchorOrAnchorLine !== 'number') {
            this.anchor = anchorOrAnchorLine as vscode.Position
            this.active = activeOrAnchorCharacter as vscode.Position
        } else {
            this.anchor = new MockPosition(anchorOrAnchorLine as number, activeOrAnchorCharacter as number)
            this.active = new MockPosition(activeLine!, activeCharacter!)
        }
    }
}

export class MockTextDocument implements vscode.TextDocument {
    public readonly uri: vscode.Uri = MockUri.file('foo/bar')

    public readonly fileName: string = 'bar'

    public readonly isUntitled: boolean = false

    public readonly languageId: string = 'node'

    public readonly version: number = 1

    public readonly isDirty: boolean = false

    public readonly isClosed: boolean = false

    public readonly eol: vscode.EndOfLine = 1

    public readonly lineCount: number = 0

    public save(): Thenable<boolean> {
        throw new Error('Not Implemented')
    }

    public lineAt(line: number): vscode.TextLine
    public lineAt(position: vscode.Position): vscode.TextLine
    public lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {
        throw new Error('Not Implemented')
    }

    public offsetAt(position: vscode.Position): number {
        throw new Error('Not Implemented')
    }

    public positionAt(offset: number): vscode.Position {
        throw new Error('Not Implemented')
    }

    public getText(range?: vscode.Range): string {
        throw new Error('Not Implemented')
    }

    public getWordRangeAtPosition(position: vscode.Position, regex?: RegExp): vscode.Range | undefined {
        throw new Error('Not Implemented')
    }

    public validateRange(range: vscode.Range): vscode.Range {
        throw new Error('Not Implemented')
    }

    public validatePosition(position: vscode.Position): vscode.Position {
        throw new Error('Not Implemented')
    }
}

export class MockTextEditor implements vscode.TextEditor {
    public readonly document: vscode.TextDocument = new MockTextDocument()

    public selection: vscode.Selection = new MockSelection(0, 0, 0, 0)

    public selections: vscode.Selection[] = []

    public readonly visibleRanges: vscode.Range[] = []

    public options: vscode.TextEditorOptions = new MockTextEditorOptions()

    public viewColumn?: vscode.ViewColumn

    public edit(
        callback: (editBuilder: vscode.TextEditorEdit) => void,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean; }
    ): Thenable<boolean> {
        throw new Error('Not Implemented')
    }

    public insertSnippet(
        snippet: vscode.SnippetString,
        location?: vscode.Position | vscode.Range | vscode.Position[] | vscode.Range[],
        options?: {
            undoStopBefore: boolean
            undoStopAfter: boolean
        }
    ): Thenable<boolean> {
        throw new Error('Not Implemented')
    }

    public setDecorations(
        decorationType: vscode.TextEditorDecorationType,
        rangesOrOptions: vscode.Range[] | vscode.DecorationOptions[]
    ): void {
        throw new Error('Not Implemented')
    }

    public revealRange(range: vscode.Range, revealType?: vscode.TextEditorRevealType): void {
    }

    public show(column?: vscode.ViewColumn): void {
    }

    public hide(): void {
    }
}

export class MockTextEditorOptions implements vscode.TextEditorOptions {
    public tabSize?: number | string = undefined

    public insertSpaces?: boolean | string = undefined

    public cursorStyle?: vscode.TextEditorCursorStyle = undefined

    public lineNumbers?: vscode.TextEditorLineNumbersStyle = undefined
}

export class MockTreeItem implements vscode.TreeItem {
    public label?: string
    public id?: string
    public iconPath?:
        string |
        vscode.Uri |
        {
            light: string | vscode.Uri
            dark: string | vscode.Uri
        } |
        vscode.ThemeIcon

    public resourceUri?: vscode.Uri

    public tooltip?: string | undefined

    public command?: vscode.Command

    public collapsibleState?: vscode.TreeItemCollapsibleState

    public contextValue?: string

    public constructor(
        label: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    )
    public constructor(
        resourceUri: vscode.Uri,
        collapsibleState?: vscode.TreeItemCollapsibleState
    )
    public constructor(
        labelOrResourceUri: string | vscode.Uri,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        if (typeof labelOrResourceUri === 'string') {
            this.label = labelOrResourceUri
        } else {
            this.resourceUri = labelOrResourceUri
        }

        this.collapsibleState = collapsibleState
    }
}

export enum MockTreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2
}

export class MockUri implements vscode.Uri {
    public readonly fsPath: string

    private constructor(
        public readonly scheme: string,
        public readonly authority: string,
        public readonly path: string,
        public readonly query: string,
        public readonly fragment: string
    ) {
        this.fsPath = path
    }

    public with(change: {
        scheme?: string
        authority?: string
        path?: string
        query?: string
        fragment?: string
    }): vscode.Uri {
        return new MockUri(
            change.scheme || this.scheme,
            change.authority || this.authority,
            change.path || this.path,
            change.query || this.query,
            change.fragment || this.fragment
        )
    }

    public toString(skipEncoding?: boolean): string {
        return ''
    }

    public toJSON(): any {
        throw new Error('Not Implemented')
    }

    public static file(path: string): vscode.Uri {
        return new MockUri('file', '', path, '', '')
    }

    public static parse(value: string): vscode.Uri {
        throw new Error('Not Implemented')
    }
}

export class MockWebview implements vscode.Webview {
    public constructor(
        public options: vscode.WebviewOptions = new MockWebviewOptions(),
        public html: string = '',
        public readonly onDidReceiveMessage: vscode.Event<any> = createMockEvent<any>()
    ) {
    }

    public postMessage(message: any): Thenable<boolean> {
        return Promise.resolve(true)
    }
}

export class MockWebviewOptions implements vscode.WebviewOptions {
    public constructor(
        public readonly enableScripts?: boolean,
        public readonly enableCommandUris?: boolean,
        public readonly localResourceRoots?: ReadonlyArray<vscode.Uri>
    ) {

    }
}

export class MockWebviewPanel implements vscode.WebviewPanel {
    public readonly onDidDispose: vscode.Event<void>
    private readonly onDidDisposeEmitter: vscode.EventEmitter<void>

    public constructor(
        public readonly viewType: string = '',
        public readonly title: string = '',
        public readonly iconPath?:
            vscode.Uri |
            {
                light: vscode.Uri
                dark: vscode.Uri
            },
        public readonly webview: vscode.Webview = new MockWebview(),
        public readonly options: vscode.WebviewPanelOptions = new MockWebviewPanelOptions(),
        public readonly viewColumn?: vscode.ViewColumn,
        public readonly active: boolean = true,
        public readonly visible: boolean = true,
        public readonly onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> =
            createMockEvent<vscode.WebviewPanelOnDidChangeViewStateEvent>()
    ) {
        this.title = ''
        this.webview = new MockWebview()
        this.options = new MockWebviewPanelOptions()
        this.active = true
        this.visible = true
        this.onDidChangeViewState = createMockEvent<vscode.WebviewPanelOnDidChangeViewStateEvent>()

        this.onDidDisposeEmitter = new MockEventEmitter()
        this.onDidDispose = this.onDidDisposeEmitter.event.bind(this.onDidDisposeEmitter) as vscode.Event<void>
    }

    public reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
    }

    public dispose(): any {
        this.onDidDisposeEmitter.fire()
        this.onDidDispose(
            () => {}
        )
    }
}

export class MockWebviewPanelOptions implements vscode.WebviewPanelOptions {
    public constructor(
        public readonly enableFindWidget?: boolean,
        public readonly retainContextWhenHidden?: boolean
    ) {
    }
}

export class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
    private readonly config: Map<string, any> = new Map<string, any>()

    public get<T>(section: string): T | undefined
    public get<T>(section: string, defaultValue: T): T
    public get<T>(section: string, defaultValue?: T): T | undefined {
        return this.config.get(section) as T || defaultValue
    }

    public has(section: string): boolean {
        throw new Error('Not Implemented')
    }

    public inspect<T>(section: string): {
        key: string
        defaultValue?: T
        globalValue?: T
        workspaceValue?: T
        workspaceFolderValue?: T
    } | undefined {
        throw new Error('Not Implemented')
    }

    public update(
        section: string,
        value: any,
        configurationTarget?: vscode.ConfigurationTarget | boolean
    ): Thenable<void> {
        this.config.set(section, value)

        return Promise.resolve()
    }

    readonly [key: string]: any
}
