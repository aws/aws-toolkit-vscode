/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    CommandsNamespace,
    DebugNamespace,
    EnvNamespace,
    LanguagesNamespace,
    TasksNamespace,
    VSCodeContext,
    WindowNamespace,
    WorkspaceNamespace
} from '../../../shared/vscode'
import { MockEnvNamespace } from './mockEnvNamespace'
import * as mocks from './mockTypes'
import { MockWindowNamespace } from './mockWindowNamespace'
import { MockWorkspaceNamespace } from './mockWorkspaceNamespace'

export class MockVSCodeContext implements VSCodeContext {
    public readonly commands: CommandsNamespace = {} as any as CommandsNamespace
    public readonly debug: DebugNamespace = {} as any as DebugNamespace
    public readonly env: EnvNamespace = new MockEnvNamespace()
    public readonly languages: LanguagesNamespace = {} as any as LanguagesNamespace
    public readonly tasks: TasksNamespace = {} as any as TasksNamespace
    public readonly window: WindowNamespace = new MockWindowNamespace()
    public readonly workspace: WorkspaceNamespace = new MockWorkspaceNamespace()

    // Import the types of all classes, enums, and fields. This allows callers to use
    // their constructors and static members (classes) and values (enums and fields).
    // Interfaces can be omitted.
    public readonly version: typeof import ('vscode').version = '1.0.0'

    // tslint:disable:variable-name
    public readonly Breakpoint: typeof import ('vscode').Breakpoint = mocks.MockBreakpoint
    public readonly CancellationTokenSource: typeof import ('vscode').CancellationTokenSource =
        mocks.MockCancellationTokenSource
    public readonly CodeAction: typeof import ('vscode').CodeAction = {} as any as typeof import ('vscode').CodeAction
    public readonly CodeActionKind: typeof import ('vscode').CodeActionKind
        = {} as any as typeof import ('vscode').CodeActionKind
    public readonly CodeLens: typeof import ('vscode').CodeLens = {} as any as typeof import ('vscode').CodeLens
    public readonly Color: typeof import ('vscode').Color = {} as any as typeof import ('vscode').Color
    public readonly ColorInformation: typeof import ('vscode').ColorInformation =
        {} as any as typeof import ('vscode').ColorInformation
    public readonly ColorPresentation: typeof import ('vscode').ColorPresentation =
        {} as any as typeof import ('vscode').ColorPresentation
    public readonly CompletionItem: typeof import ('vscode').CompletionItem =
        {} as any as typeof import ('vscode').CompletionItem
    public readonly CompletionItemKind: typeof import ('vscode').CompletionItemKind =
        {} as any as typeof import ('vscode').CompletionItemKind
    public readonly CompletionList: typeof import ('vscode').CompletionList =
        {} as any as typeof import ('vscode').CompletionList
    public readonly CompletionTriggerKind: typeof import ('vscode').CompletionTriggerKind =
        {} as any as typeof import ('vscode').CompletionTriggerKind
    public readonly ConfigurationTarget: typeof import ('vscode').ConfigurationTarget =
        {} as any as typeof import ('vscode').ConfigurationTarget
    public readonly DecorationRangeBehavior: typeof import ('vscode').DecorationRangeBehavior =
        {} as any as typeof import ('vscode').DecorationRangeBehavior
    public readonly Diagnostic: typeof import ('vscode').Diagnostic =
        {} as any as typeof import ('vscode').Diagnostic
    public readonly DiagnosticRelatedInformation: typeof import ('vscode').DiagnosticRelatedInformation =
        {} as any as typeof import ('vscode').DiagnosticRelatedInformation
    public readonly DiagnosticSeverity: typeof import ('vscode').DiagnosticSeverity =
        {} as any as typeof import ('vscode').DiagnosticSeverity
    public readonly DiagnosticTag: typeof import ('vscode').DiagnosticTag =
        {} as any as typeof import ('vscode').DiagnosticTag
    public readonly Disposable: typeof import ('vscode').Disposable = {} as any as typeof import ('vscode').Disposable
    public readonly DocumentHighlight: typeof import ('vscode').DocumentHighlight =
        {} as any as typeof import ('vscode').DocumentHighlight
    public readonly DocumentHighlightKind: typeof import ('vscode').DocumentHighlightKind =
        {} as any as typeof import ('vscode').DocumentHighlightKind
    public readonly DocumentLink: typeof import ('vscode').DocumentLink =
        {} as any as typeof import ('vscode').DocumentLink
    public readonly DocumentSymbol: typeof import ('vscode').DocumentSymbol =
        {} as any as typeof import ('vscode').DocumentSymbol
    public readonly EndOfLine: typeof import ('vscode').EndOfLine = {} as any as typeof import ('vscode').EndOfLine
    public readonly EventEmitter: typeof import ('vscode').EventEmitter = mocks.MockEventEmitter
    public readonly FileChangeType: typeof import ('vscode').FileChangeType =
        {} as any as typeof import ('vscode').FileChangeType
    public readonly FileSystemError: typeof import ('vscode').FileSystemError =
        {} as any as typeof import ('vscode').FileSystemError
    public readonly FileType: typeof import ('vscode').FileType =
        {} as any as typeof import ('vscode').FileType
    public readonly FoldingRange: typeof import ('vscode').FoldingRange =
        {} as any as typeof import ('vscode').FoldingRange
    public readonly FoldingRangeKind: typeof import ('vscode').FoldingRangeKind =
        {} as any as typeof import ('vscode').FoldingRangeKind
    public readonly FunctionBreakpoint: typeof import ('vscode').FunctionBreakpoint =
        {} as any as typeof import ('vscode').FunctionBreakpoint
    public readonly Hover: typeof import ('vscode').Hover =
        {} as any as typeof import ('vscode').Hover
    public readonly IndentAction: typeof import ('vscode').IndentAction =
        {} as any as typeof import ('vscode').IndentAction
    public readonly Location: typeof import ('vscode').Location =
        {} as any as typeof import ('vscode').Location
    public readonly MarkdownString: typeof import ('vscode').MarkdownString =
        {} as any as typeof import ('vscode').MarkdownString
    public readonly OverviewRulerLane: typeof import ('vscode').OverviewRulerLane =
        {} as any as typeof import ('vscode').OverviewRulerLane
    public readonly ParameterInformation: typeof import ('vscode').ParameterInformation =
        {} as any as typeof import ('vscode').ParameterInformation
    public readonly Position: typeof import ('vscode').Position = mocks.MockPosition
    public readonly ProcessExecution: typeof import ('vscode').ProcessExecution =
        {} as any as typeof import ('vscode').ProcessExecution
    public readonly ProgressLocation: typeof import ('vscode').ProgressLocation =
        {} as any as typeof import ('vscode').ProgressLocation
    public readonly QuickInputButtons: typeof import ('vscode').QuickInputButtons =
        {} as any as typeof import ('vscode').QuickInputButtons
    public readonly Range: typeof import ('vscode').Range = mocks.MockRange
    public readonly RelativePattern: typeof import ('vscode').RelativePattern =
        {} as any as typeof import ('vscode').RelativePattern
    public readonly Selection: typeof import ('vscode').Selection = mocks.MockSelection
    public readonly ShellExecution: typeof import ('vscode').ShellExecution =
        {} as any as typeof import ('vscode').ShellExecution
    public readonly ShellQuoting: typeof import ('vscode').ShellQuoting =
        {} as any as typeof import ('vscode').ShellQuoting
    public readonly SignatureInformation: typeof import ('vscode').SignatureInformation =
        {} as any as typeof import ('vscode').SignatureInformation
    public readonly SignatureHelp: typeof import ('vscode').SignatureHelp =
        {} as any as typeof import ('vscode').SignatureHelp
    public readonly SnippetString: typeof import ('vscode').SnippetString =
        {} as any as typeof import ('vscode').SnippetString
    public readonly SourceBreakpoint: typeof import ('vscode').SourceBreakpoint =
        {} as any as typeof import ('vscode').SourceBreakpoint
    public readonly StatusBarAlignment: typeof import ('vscode').StatusBarAlignment =
        {} as any as typeof import ('vscode').StatusBarAlignment
    public readonly SymbolInformation: typeof import ('vscode').SymbolInformation =
        {} as any as typeof import ('vscode').SymbolInformation
    public readonly SymbolKind: typeof import ('vscode').SymbolKind = {} as any as typeof import ('vscode').SymbolKind
    public readonly Task: typeof import ('vscode').Task = {} as any as typeof import ('vscode').Task
    public readonly TaskGroup: typeof import ('vscode').TaskGroup = {} as any as typeof import ('vscode').TaskGroup
    public readonly TaskPanelKind: typeof import ('vscode').TaskPanelKind =
        {} as any as typeof import ('vscode').TaskPanelKind
    public readonly TaskRevealKind: typeof import ('vscode').TaskRevealKind =
        {} as any as typeof import ('vscode').TaskRevealKind
    public readonly TaskScope: typeof import ('vscode').TaskScope = {} as any as typeof import ('vscode').TaskScope
    public readonly TextDocumentSaveReason: typeof import ('vscode').TextDocumentSaveReason =
        {} as any as typeof import ('vscode').TextDocumentSaveReason
    public readonly TextEdit: typeof import ('vscode').TextEdit = {} as any as typeof import ('vscode').TextEdit
    public readonly TextEditorCursorStyle: typeof import ('vscode').TextEditorCursorStyle =
        {} as any as typeof import ('vscode').TextEditorCursorStyle
    public readonly TextEditorLineNumbersStyle: typeof import ('vscode').TextEditorLineNumbersStyle =
        {} as any as typeof import ('vscode').TextEditorLineNumbersStyle
    public readonly TextEditorRevealType: typeof import ('vscode').TextEditorRevealType =
        {} as any as typeof import ('vscode').TextEditorRevealType
    public readonly TextEditorSelectionChangeKind: typeof import ('vscode').TextEditorSelectionChangeKind =
        {} as any as typeof import ('vscode').TextEditorSelectionChangeKind
    public readonly ThemeColor: typeof import ('vscode').ThemeColor = {} as any as typeof import ('vscode').ThemeColor
    public readonly ThemeIcon: typeof import ('vscode').ThemeIcon = {} as any as typeof import ('vscode').ThemeIcon
    public readonly TreeItem: typeof import ('vscode').TreeItem = mocks.MockTreeItem
    public readonly TreeItemCollapsibleState: typeof import ('vscode').TreeItemCollapsibleState =
        {} as any as typeof import ('vscode').TreeItemCollapsibleState
    public readonly Uri: typeof import ('vscode').Uri = mocks.MockUri
    public readonly ViewColumn: typeof import ('vscode').ViewColumn = {} as any as typeof import ('vscode').ViewColumn
    public readonly WorkspaceEdit: typeof import ('vscode').WorkspaceEdit =
        {} as any as typeof import ('vscode').WorkspaceEdit
    // tslint:enable:variable-name
}
