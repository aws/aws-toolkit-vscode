/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import {
    CommandsNamespace,
    DebugNamespace,
    EnvNamespace,
    LanguagesNamespace,
    TasksNamespace,
    VSCodeContext,
    WindowNamespace,
    WorkspaceNamespace,
} from '..'
import { DefaultCommandsNamespace } from './defaultCommandsNamespace'
import { DefaultDebugNamespace } from './defaultDebugNamespace'
import { DefaultEnvNamespace } from './defaultEnvNamespace'
import { DefaultLanguagesNamespace } from './defaultLanguagesNamespace'
import { DefaultTasksNamespace } from './defaultTasksNamespace'
import { DefaultWindowNamespace } from './defaultWindowNamespace'
import { DefaultWorkspaceNamespace } from './defaultWorkspaceNamespace'

export class DefaultVSCodeContext implements VSCodeContext {
    public readonly commands: CommandsNamespace = new DefaultCommandsNamespace()
    public readonly debug: DebugNamespace = new DefaultDebugNamespace()
    public readonly env: EnvNamespace = new DefaultEnvNamespace()
    public readonly languages: LanguagesNamespace = new DefaultLanguagesNamespace()
    public readonly tasks: TasksNamespace = new DefaultTasksNamespace()
    public readonly window: WindowNamespace = new DefaultWindowNamespace()
    public readonly workspace: WorkspaceNamespace = new DefaultWorkspaceNamespace()

    // Import the types of all classes, enums, and fields. This allows callers to use
    // their constructors and static members (classes) and values (enums and fields).
    public readonly version: typeof vscode.version = vscode.version

    public readonly Breakpoint: typeof vscode.Breakpoint = vscode.Breakpoint
    public readonly CancellationTokenSource: typeof vscode.CancellationTokenSource = vscode.CancellationTokenSource
    public readonly CodeAction: typeof vscode.CodeAction = vscode.CodeAction
    public readonly CodeActionKind: typeof vscode.CodeActionKind = vscode.CodeActionKind
    public readonly CodeLens: typeof vscode.CodeLens = vscode.CodeLens
    public readonly Color: typeof vscode.Color = vscode.Color
    public readonly ColorInformation: typeof vscode.ColorInformation = vscode.ColorInformation
    public readonly ColorPresentation: typeof vscode.ColorPresentation = vscode.ColorPresentation
    public readonly CompletionItem: typeof vscode.CompletionItem = vscode.CompletionItem
    public readonly CompletionItemKind: typeof vscode.CompletionItemKind = vscode.CompletionItemKind
    public readonly CompletionList: typeof vscode.CompletionList = vscode.CompletionList
    public readonly CompletionTriggerKind: typeof vscode.CompletionTriggerKind = vscode.CompletionTriggerKind
    public readonly ConfigurationTarget: typeof vscode.ConfigurationTarget = vscode.ConfigurationTarget
    public readonly DecorationRangeBehavior: typeof vscode.DecorationRangeBehavior = vscode.DecorationRangeBehavior
    public readonly Diagnostic: typeof vscode.Diagnostic = vscode.Diagnostic
    public readonly DiagnosticRelatedInformation: typeof vscode.DiagnosticRelatedInformation =
        vscode.DiagnosticRelatedInformation
    public readonly DiagnosticSeverity: typeof vscode.DiagnosticSeverity = vscode.DiagnosticSeverity
    public readonly DiagnosticTag: typeof vscode.DiagnosticTag = vscode.DiagnosticTag
    public readonly Disposable: typeof vscode.Disposable = vscode.Disposable
    public readonly DocumentHighlight: typeof vscode.DocumentHighlight = vscode.DocumentHighlight
    public readonly DocumentHighlightKind: typeof vscode.DocumentHighlightKind = vscode.DocumentHighlightKind
    public readonly DocumentLink: typeof vscode.DocumentLink = vscode.DocumentLink
    public readonly DocumentSymbol: typeof vscode.DocumentSymbol = vscode.DocumentSymbol
    public readonly EndOfLine: typeof vscode.EndOfLine = vscode.EndOfLine
    public readonly EventEmitter: typeof vscode.EventEmitter = vscode.EventEmitter
    public readonly FileChangeType: typeof vscode.FileChangeType = vscode.FileChangeType
    public readonly FileSystemError: typeof vscode.FileSystemError = vscode.FileSystemError
    public readonly FileType: typeof vscode.FileType = vscode.FileType
    public readonly FoldingRange: typeof vscode.FoldingRange = vscode.FoldingRange
    public readonly FoldingRangeKind: typeof vscode.FoldingRangeKind = vscode.FoldingRangeKind
    public readonly FunctionBreakpoint: typeof vscode.FunctionBreakpoint = vscode.FunctionBreakpoint
    public readonly Hover: typeof vscode.Hover = vscode.Hover
    public readonly IndentAction: typeof vscode.IndentAction = vscode.IndentAction
    public readonly Location: typeof vscode.Location = vscode.Location
    public readonly MarkdownString: typeof vscode.MarkdownString = vscode.MarkdownString
    public readonly OverviewRulerLane: typeof vscode.OverviewRulerLane = vscode.OverviewRulerLane
    public readonly ParameterInformation: typeof vscode.ParameterInformation = vscode.ParameterInformation
    public readonly Position: typeof vscode.Position = vscode.Position
    public readonly ProcessExecution: typeof vscode.ProcessExecution = vscode.ProcessExecution
    public readonly ProgressLocation: typeof vscode.ProgressLocation = vscode.ProgressLocation
    public readonly QuickInputButtons: typeof vscode.QuickInputButtons = vscode.QuickInputButtons
    public readonly Range: typeof vscode.Range = vscode.Range
    public readonly RelativePattern: typeof vscode.RelativePattern = vscode.RelativePattern
    public readonly Selection: typeof vscode.Selection = vscode.Selection
    public readonly ShellExecution: typeof vscode.ShellExecution = vscode.ShellExecution
    public readonly ShellQuoting: typeof vscode.ShellQuoting = vscode.ShellQuoting
    public readonly SignatureHelp: typeof vscode.SignatureHelp = vscode.SignatureHelp
    public readonly SignatureInformation: typeof vscode.SignatureInformation = vscode.SignatureInformation
    public readonly SnippetString: typeof vscode.SnippetString = vscode.SnippetString
    public readonly SourceBreakpoint: typeof vscode.SourceBreakpoint = vscode.SourceBreakpoint
    public readonly StatusBarAlignment: typeof vscode.StatusBarAlignment = vscode.StatusBarAlignment
    public readonly SymbolInformation: typeof vscode.SymbolInformation = vscode.SymbolInformation
    public readonly SymbolKind: typeof vscode.SymbolKind = vscode.SymbolKind
    public readonly Task: typeof vscode.Task = vscode.Task
    public readonly TaskGroup: typeof vscode.TaskGroup = vscode.TaskGroup
    public readonly TaskScope: typeof vscode.TaskScope = vscode.TaskScope
    public readonly TaskPanelKind: typeof vscode.TaskPanelKind = vscode.TaskPanelKind
    public readonly TaskRevealKind: typeof vscode.TaskRevealKind = vscode.TaskRevealKind
    public readonly TextDocumentSaveReason: typeof vscode.TextDocumentSaveReason = vscode.TextDocumentSaveReason
    public readonly TextEdit: typeof vscode.TextEdit = vscode.TextEdit
    public readonly TextEditorCursorStyle: typeof vscode.TextEditorCursorStyle = vscode.TextEditorCursorStyle
    public readonly TextEditorLineNumbersStyle: typeof vscode.TextEditorLineNumbersStyle =
        vscode.TextEditorLineNumbersStyle
    public readonly TextEditorRevealType: typeof vscode.TextEditorRevealType = vscode.TextEditorRevealType
    public readonly TextEditorSelectionChangeKind: typeof vscode.TextEditorSelectionChangeKind =
        vscode.TextEditorSelectionChangeKind
    public readonly ThemeColor: typeof vscode.ThemeColor = vscode.ThemeColor
    public readonly ThemeIcon: typeof vscode.ThemeIcon = vscode.ThemeIcon
    public readonly TreeItem: typeof vscode.TreeItem = vscode.TreeItem
    public readonly TreeItemCollapsibleState: typeof vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState
    public readonly Uri: typeof vscode.Uri = vscode.Uri
    public readonly ViewColumn: typeof vscode.ViewColumn = vscode.ViewColumn
    public readonly WorkspaceEdit: typeof vscode.WorkspaceEdit = vscode.WorkspaceEdit
}
