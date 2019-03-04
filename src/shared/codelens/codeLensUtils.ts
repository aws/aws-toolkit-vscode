/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    SamCliProcessInvoker,
    SamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SettingsConfiguration } from '../settingsConfiguration'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const log = (channel: vscode.OutputChannel, level: LogLevel, msg: string, err?: Error): void => {
    channel.show()
    const _msg = `[${level}]: ${msg}`
    if (err) {
        // TODO: Define standard/strategy. Sometimes err.message is part of msg. Probably shouldn't be.
        channel.appendLine(`${msg}: ${ err.message}`)
        console[level](new Date().toISOString(), _msg, err.stack)
    } else {
        channel.appendLine(msg)
        console[level](new Date().toISOString(), _msg)
    }
}

export enum OutputChannelName {
    ToolKit = 'ToolKit', // localize('AWS.channel.aws.toolkit', 'AWS Toolkit')
    Lambda = 'Lambda'
}
const outputChannels: {[channelName: string]: vscode.OutputChannel} = {
    [OutputChannelName.ToolKit.toString()]: vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', 'AWS Toolkit')
    ),
    [OutputChannelName.Lambda.toString()]: vscode.window.createOutputChannel('AWS Lambda')
}

export const getOutputChannel = (name: OutputChannelName) => outputChannels[name.toString()]

export const getLogger = (channelName: OutputChannelName) => {
    const channel = outputChannels[channelName.toString()]

    return {
        debug: (msg: string) => log(channel, 'debug', msg),
        info: (msg: string) => log(channel, 'info', msg),
        warn: (msg: string) => log(channel, 'warn', msg),
        error: (msg: string, err?: Error) => log(channel, 'error', msg, err)
    }
}

const logger = getLogger(OutputChannelName.ToolKit)

export interface CodeLensProviderParams {
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    processInvoker?: SamCliProcessInvoker,
    taskInvoker?: SamCliTaskInvoker
}

export const getLambdaHandlerCandidates = async ({uri}: {uri: vscode.Uri}): Promise<LambdaHandlerCandidate[]> => {
    const filename = uri.fsPath
    // DocumentSymbol[]> => {
    if (!vscode.window.activeTextEditor) {
        logger.warn("'vscode.window.activeTextEditor' is not defined!")

        return []
    } else {
        logger.info(`Getting symbols for '${uri.fsPath}'`)
        const symbols: vscode.DocumentSymbol[] = ( // SymbolInformation has less detail (no children)
            (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            )) || []
        )

        return symbols
            .filter(sym => sym.kind === vscode.SymbolKind.Function)
            .map(symbol => {
                logger.debug(`Found potential handler: '${path.parse(filename).name}.${symbol.name}'`)

                return {
                    filename,
                    handlerName: `${path.parse(filename).name}.${symbol.name}`,
                    positionStart: symbol.range.start.line,
                    positionEnd: symbol.range.end.line,
                    range: symbol.range
                }
            })
    }
}

export const  makeCodeLenses = async ({ document, token, handlers, lang }: {
  document: vscode.TextDocument,
  token: vscode.CancellationToken,
  handlers: LambdaHandlerCandidate[],
  lang: Language
}): Promise<vscode.CodeLens[]> => {

  const lenses: vscode.CodeLens[] = []

  handlers.forEach(handler => {
      const range = handler.range || new vscode.Range(
        // Is this a line number (positionStartLine or positionStartChar?)
        document.positionAt(handler.positionStart),
        document.positionAt(handler.positionEnd),
      )
      const workspaceFolder:
          vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

      if (!workspaceFolder) {
          throw new Error(`Source file ${document.uri} is external to the current workspace.`)
      }
      const baseParams: CodeLensParams = {
          document,
          handlerName: handler.handlerName,
          range,
          workspaceFolder,
          lang
      }
      lenses.push(makeLocalInvokeCodeLens({...baseParams, debug: false}))
      lenses.push(makeLocalInvokeCodeLens({...baseParams, debug: true}))

      try {
          lenses.push(makeConfigureCodeLens(baseParams))
      } catch (err) {
          const error = err as Error
          logger.error(
              `Could not generate 'configure' code lens for handler '${handler.handlerName}'`,
              error
          )
      }
  })

  return lenses
}

export type Language = 'python' | 'javascript'

export const getInvokeCmdKey = (lang: Language) => `aws.lambda.local.invoke.${lang}`

interface CodeLensParams {
    document: vscode.TextDocument,
    handlerName: string,
    range: vscode.Range,
    workspaceFolder: vscode.WorkspaceFolder,
    lang: Language
}

const makeLocalInvokeCodeLens = (params: CodeLensParams & {debug: boolean, lang: Language}): vscode.CodeLens => {
  const title: string = params.debug ?
      localize('AWS.codelens.lambda.invoke.debug', 'Debug Locally') :
      localize('AWS.codelens.lambda.invoke', 'Run Locally')

  const command: vscode.Command = {
      arguments: [params],
      command: getInvokeCmdKey(params.lang),
      title
  }

  return new vscode.CodeLens(params.range, command)
}

const makeConfigureCodeLens = (
  { document, handlerName, range, workspaceFolder }: CodeLensParams
): vscode.CodeLens => {
  // Handler will be the fully-qualified name, so we also allow '.' despite it being forbidden in handler names.
  if (/[^\w\-\.]/.test(handlerName)) {
      throw new Error(
          `Invalid handler name: '${handlerName}'. ` +
          'Handler names can contain only letters, numbers, hyphens, and underscores.'
      )
  }
  const command = {
      arguments: [workspaceFolder, handlerName],
      command: 'aws.configureLambda',
      title: localize('AWS.command.configureLambda', 'Configure')
  }

  return new vscode.CodeLens(range, command)
}
