/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CommandsNamespace } from './commandsNamespace'
import { DebugNamespace } from './debugNamespace'
import { EnvNamespace } from './envNamespace'
import { LanguagesNamespace } from './languagesNamespace'
import { TasksNamespace } from './tasksNamespace'
import { WindowNamespace } from './windowNamespace'
import { WorkspaceNamespace } from './workspaceNamespace'

export interface VSCodeContext {
    readonly commands: CommandsNamespace
    readonly debug: DebugNamespace
    readonly env: EnvNamespace
    readonly languages: LanguagesNamespace
    readonly tasks: TasksNamespace
    readonly window: WindowNamespace
    readonly workspace: WorkspaceNamespace

    // Import the types of all classes, enums, and fields. This allows callers to use
    // their constructors and static members (classes) and values (enums and fields).
    // Interfaces can be omitted.
    readonly version: typeof import ('vscode').version

    readonly Breakpoint: typeof import ('vscode').Breakpoint
    readonly CancellationTokenSource: typeof import ('vscode').CancellationTokenSource
    readonly CodeAction: typeof import ('vscode').CodeAction
    readonly CodeActionKind: typeof import ('vscode').CodeActionKind
    readonly CodeLens: typeof import ('vscode').CodeLens
    readonly Color: typeof import ('vscode').Color
    readonly ColorInformation: typeof import ('vscode').ColorInformation
    readonly ColorPresentation: typeof import ('vscode').ColorPresentation
    readonly CompletionItem: typeof import ('vscode').CompletionItem
    readonly CompletionItemKind: typeof import ('vscode').CompletionItemKind
    readonly CompletionList: typeof import ('vscode').CompletionList
    readonly CompletionTriggerKind: typeof import ('vscode').CompletionTriggerKind
    readonly ConfigurationTarget: typeof import ('vscode').ConfigurationTarget
    readonly DecorationRangeBehavior: typeof import ('vscode').DecorationRangeBehavior
    readonly Diagnostic: typeof import ('vscode').Diagnostic
    readonly DiagnosticRelatedInformation: typeof import ('vscode').DiagnosticRelatedInformation
    readonly DiagnosticSeverity: typeof import ('vscode').DiagnosticSeverity
    readonly DiagnosticTag: typeof import ('vscode').DiagnosticTag
    readonly Disposable: typeof import ('vscode').Disposable
    readonly DocumentHighlight: typeof import ('vscode').DocumentHighlight
    readonly DocumentHighlightKind: typeof import ('vscode').DocumentHighlightKind
    readonly DocumentLink: typeof import ('vscode').DocumentLink
    readonly DocumentSymbol: typeof import ('vscode').DocumentSymbol
    readonly EndOfLine: typeof import ('vscode').EndOfLine
    readonly EventEmitter: typeof import ('vscode').EventEmitter
    readonly FileChangeType: typeof import ('vscode').FileChangeType
    readonly FileSystemError: typeof import ('vscode').FileSystemError
    readonly FileType: typeof import ('vscode').FileType
    readonly FoldingRange: typeof import ('vscode').FoldingRange
    readonly FoldingRangeKind: typeof import ('vscode').FoldingRangeKind
    readonly FunctionBreakpoint: typeof import ('vscode').FunctionBreakpoint
    readonly Hover: typeof import ('vscode').Hover
    readonly IndentAction: typeof import ('vscode').IndentAction
    readonly Location: typeof import ('vscode').Location
    readonly MarkdownString: typeof import ('vscode').MarkdownString
    readonly OverviewRulerLane: typeof import ('vscode').OverviewRulerLane
    readonly ParameterInformation: typeof import ('vscode').ParameterInformation
    readonly Position: typeof import ('vscode').Position
    readonly ProcessExecution: typeof import ('vscode').ProcessExecution
    readonly ProgressLocation: typeof import ('vscode').ProgressLocation
    readonly QuickInputButtons: typeof import ('vscode').QuickInputButtons
    readonly Range: typeof import ('vscode').Range
    readonly RelativePattern: typeof import ('vscode').RelativePattern
    readonly Selection: typeof import ('vscode').Selection
    readonly ShellExecution: typeof import ('vscode').ShellExecution
    readonly ShellQuoting: typeof import ('vscode').ShellQuoting
    readonly SignatureInformation: typeof import ('vscode').SignatureInformation
    readonly SignatureHelp: typeof import ('vscode').SignatureHelp
    readonly SnippetString: typeof import ('vscode').SnippetString
    readonly SourceBreakpoint: typeof import ('vscode').SourceBreakpoint
    readonly StatusBarAlignment: typeof import ('vscode').StatusBarAlignment
    readonly SymbolInformation: typeof import ('vscode').SymbolInformation
    readonly SymbolKind: typeof import ('vscode').SymbolKind
    readonly Task: typeof import ('vscode').Task
    readonly TaskGroup: typeof import ('vscode').TaskGroup
    readonly TaskPanelKind: typeof import ('vscode').TaskPanelKind
    readonly TaskRevealKind: typeof import ('vscode').TaskRevealKind
    readonly TaskScope: typeof import ('vscode').TaskScope
    readonly TextDocumentSaveReason: typeof import ('vscode').TextDocumentSaveReason
    readonly TextEdit: typeof import ('vscode').TextEdit
    readonly TextEditorCursorStyle: typeof import ('vscode').TextEditorCursorStyle
    readonly TextEditorLineNumbersStyle: typeof import ('vscode').TextEditorLineNumbersStyle
    readonly TextEditorRevealType: typeof import ('vscode').TextEditorRevealType
    readonly TextEditorSelectionChangeKind: typeof import ('vscode').TextEditorSelectionChangeKind
    readonly ThemeColor: typeof import ('vscode').ThemeColor
    readonly ThemeIcon: typeof import ('vscode').ThemeIcon
    readonly TreeItem: typeof import ('vscode').TreeItem
    readonly TreeItemCollapsibleState: typeof import ('vscode').TreeItemCollapsibleState
    readonly Uri: typeof import ('vscode').Uri
    readonly ViewColumn: typeof import ('vscode').ViewColumn
    readonly WorkspaceEdit: typeof import ('vscode').WorkspaceEdit
}
