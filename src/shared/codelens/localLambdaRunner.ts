/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as tcpPortUsed from 'tcp-port-used'
import * as vscode from 'vscode'

import { buildHandlerConfig, getLocalLambdaConfiguration, HandlerConfig } from '../../lambda/local/configureLocalLambda'
import { detectLocalLambdas } from '../../lambda/local/detectLocalLambdas'
// import { NodeDebugConfiguration } from '../../lambda/local/nodeDebugConfiguration'
import { CloudFormation } from '../cloudformation/cloudformation'
import { mkdir, writeFile } from '../filesystem'
import { SamCliBuildInvocation } from '../sam/cli/samCliBuild'
import {
    SamCliProcessInvoker,
    SamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SamCliLocalInvokeInvocation } from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { SamTemplateGenerator } from '../templates/sam/samTemplateGenerator'
import { ExtensionDisposableFiles } from '../utilities/disposableFiles'

export interface LambdaLocalInvokeArguments {
  document: vscode.TextDocument,
  range: vscode.Range,
  handlerName: string,
  debug: boolean,
  workspaceFolder: vscode.WorkspaceFolder
}

export interface SAMTemplateEnvironmentVariables {
  [resource: string]: {
      [key: string]: string
  }
}

export class LocalLambdaRunner {

  private static readonly TEMPLATE_RESOURCE_NAME: string = 'awsToolkitSamLocalResource'
  private static readonly SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS: number = 125
  private static readonly SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT: number = 30000

  private _baseBuildFolder?: string
  private readonly _debugPort?: number

  public constructor(
      private readonly configuration: SettingsConfiguration,
      private readonly localInvokeArgs: LambdaLocalInvokeArguments,
      debugPort: number | undefined,
      private readonly runtime: string,
      private readonly outputChannel: vscode.OutputChannel,
      private readonly processInvoker: SamCliProcessInvoker,
      private readonly taskInvoker: SamCliTaskInvoker,
      private readonly debugConfig: vscode.DebugConfiguration,
      private readonly codeRootDirectoryPath: string,
      private readonly onWillAttachDebugger?: () => Promise<void>,
      private readonly onDidSamBuild?: () => Promise<void>
  ) {
      if (localInvokeArgs.debug && !debugPort) {
          throw new Error('Debug port must be provided when launching in debug mode')
      }

      this._debugPort = debugPort
  }

  public async run(): Promise<void> {
      try {
          this.outputChannel.show(true)
          this.outputChannel.appendLine(
              localize(
                  'AWS.output.sam.local.start',
                  'Preparing to run {0} locally...',
                  this.localInvokeArgs.handlerName
              )
          )

          // const rootCodeFolder: string = await this.determineRootCodeFolder()

          const inputTemplate: string = await this.generateInputTemplate(this.codeRootDirectoryPath)
          const samBuildTemplate: string = await this.executeSamBuild(this.codeRootDirectoryPath, inputTemplate)

          await this.invokeLambdaFunction(samBuildTemplate)

      } catch (err) {
          console.log(err)
          const error = err as Error

          this.outputChannel.appendLine(
              localize(
                  'AWS.output.sam.local.error',
                  'Error: {0}',
                  error.message
              )
          )

          vscode.window.showErrorMessage(
              localize(
                  'AWS.error.during.sam.local',
                  'An error occurred trying to run SAM Application locally: {0}',
                  error.message
              )
          )

          return
      }

  }

  public get debugPort(): number {
      if (!this._debugPort) {
          throw new Error('Debug port was expected but is undefined')
      }

      return this._debugPort
  }

  private async getBaseBuildFolder(): Promise<string> {
      if (!this._baseBuildFolder) {
          const baseBuildDir = path.join(
              ExtensionDisposableFiles.getInstance().toolkitTempFolder,
              'build'
          )
          await mkdir(baseBuildDir)
          this._baseBuildFolder = baseBuildDir
          ExtensionDisposableFiles.getInstance().addFolder(this._baseBuildFolder)
      }

      return this._baseBuildFolder
  }

  /**
   * Create the SAM Template that will be passed in to sam build.
   * @returns Path to the generated template file
   */
  private async generateInputTemplate(
      rootCodeFolder: string
  ): Promise<string> {
      const buildFolder: string = await this.getBaseBuildFolder()
      const inputTemplatePath: string = path.join(buildFolder, 'input', 'input-template.yaml')

      // Make function handler relative to baseDir
      const handlerFileRelativePath = path.relative(
          rootCodeFolder,
          path.dirname(this.localInvokeArgs.document.uri.fsPath)
      )

      const relativeFunctionHandler = path.join(
          handlerFileRelativePath,
          this.localInvokeArgs.handlerName
      ).replace('\\', '/')

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.localInvokeArgs.workspaceFolder.uri)
      let existingTemplateResource: CloudFormation.Resource | undefined
      if (workspaceFolder) {
          const lambdas = await detectLocalLambdas([workspaceFolder])
          const existingLambda = lambdas.find(lambda => lambda.handler === relativeFunctionHandler)
          existingTemplateResource = existingLambda ? existingLambda.resource : undefined
      }

      let newTemplate = new SamTemplateGenerator()
          .withCodeUri(rootCodeFolder)
          .withFunctionHandler(relativeFunctionHandler)
          .withResourceName(LocalLambdaRunner.TEMPLATE_RESOURCE_NAME)
          .withRuntime(this.runtime)

      if (existingTemplateResource && existingTemplateResource.Properties &&
          existingTemplateResource.Properties.Environment) {
          newTemplate = newTemplate.withEnvironment(existingTemplateResource.Properties.Environment)
      }

      await newTemplate.generate(inputTemplatePath)

      return inputTemplatePath
  }

  // private async determineRootCodeFolder(): Promise<string> {
  //     const packageJsonPath: string | undefined =
  //         await filesystemUtilities.findFileInParentPaths(
  //             path.dirname(this.localInvokeArgs.document.uri.fsPath),
  //             'package.json'
  //         )

  //     if (!packageJsonPath) {
  //         throw new Error(
  //             localize(
  //                 'AWS.error.sam.local.package_json_not_found',
  //                 'Unable to find package.json related to {0}',
  //                 this.localInvokeArgs.document.uri.fsPath
  //             )
  //         )
  //     }

  //     return path.dirname(packageJsonPath)
  // }

  private async executeSamBuild(
      rootCodeFolder: string,
      inputTemplatePath: string
  ): Promise<string> {
      this.outputChannel.appendLine(
          localize(
              'AWS.output.building.sam.application',
              'Building SAM Application...'
          )
      )

      const samBuildOutputFolder = path.join(await this.getBaseBuildFolder(), 'output')

      await new SamCliBuildInvocation(
          samBuildOutputFolder,
          rootCodeFolder,
          inputTemplatePath,
          this.processInvoker
      ).execute()

      this.outputChannel.appendLine(
          localize(
              'AWS.output.building.sam.application.complete',
              'Build complete.'
          )
      )

      if (this.onDidSamBuild) {
        // Enable post build tasks if needed
        await this.onDidSamBuild()
      }

      return path.join(samBuildOutputFolder, 'template.yaml')
  }

  /**
   * Runs `sam local invoke` against the provided template file
   * @param samTemplatePath sam template to run locally
   */
  private async invokeLambdaFunction(
      samTemplatePath: string,
  ): Promise<void> {
      this.outputChannel.appendLine(
          localize(
              'AWS.output.starting.sam.app.locally',
              'Starting the SAM Application locally (see Terminal for output)'
          )
      )

      const eventPath: string = path.join(await this.getBaseBuildFolder(), 'event.json')
      const environmentVariablePath = path.join(await this.getBaseBuildFolder(), 'env-vars.json')
      const config = await this.getConfig()

      await writeFile(eventPath, JSON.stringify(config.event || {}))
      await writeFile(
          environmentVariablePath,
          JSON.stringify(this.getEnvironmentVariables(config))
      )

      const command = new SamCliLocalInvokeInvocation(
          LocalLambdaRunner.TEMPLATE_RESOURCE_NAME,
          samTemplatePath,
          eventPath,
          environmentVariablePath,
          (!!this._debugPort) ? this._debugPort.toString() : undefined,
          this.taskInvoker
      )

      await command.execute()

      if (this.localInvokeArgs.debug) {
          this.outputChannel.appendLine(
              localize(
                  'AWS.output.sam.local.waiting',
                  'Waiting for SAM Application to start before attaching debugger...'
              )
          )

          const timeoutMillis = this.configuration.readSetting<number>(
              'samcli.debug.attach.timeout.millis',
              LocalLambdaRunner.SAM_LOCAL_PORT_CHECK_RETRY_TIMEOUT_MILLIS_DEFAULT)

          await tcpPortUsed.waitUntilUsed(
              this.debugPort,
              LocalLambdaRunner.SAM_LOCAL_PORT_CHECK_RETRY_INTERVAL_MILLIS,
              timeoutMillis
          )

          await this.attachDebugger(this.debugPort)
      }
  }

  private async getConfig(): Promise<HandlerConfig> {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.localInvokeArgs.document.uri)
      if (!workspaceFolder) {
          return buildHandlerConfig()
      }

      const config: HandlerConfig = await getLocalLambdaConfiguration(
          workspaceFolder,
          this.localInvokeArgs.handlerName
      )

      return config
  }

  private getEnvironmentVariables(config: HandlerConfig): SAMTemplateEnvironmentVariables {
      if (!!config.environmentVariables) {
          return {
              [LocalLambdaRunner.TEMPLATE_RESOURCE_NAME]: config.environmentVariables
          }
      } else {
          return {}
      }
  }

  private async attachDebugger(debugPort: number) {

      // if (!this.debugConfig.rootFolder) {
      //   this.debugConfig.rootFolder = await this.determineRootCodeFolder()
      // }

      if (this.onWillAttachDebugger) {
        // Enable caller to do last minute preperation before ataching debugger
        await this.onWillAttachDebugger()
      }

      this.outputChannel.appendLine(
          localize(
              'AWS.output.sam.local.attaching',
              'Attaching to SAM Application...'
          )
      )

      const attachSuccess: boolean = await vscode.debug.startDebugging(undefined, this.debugConfig)

      if (attachSuccess) {
          this.outputChannel.appendLine(
              localize(
                  'AWS.output.sam.local.attach.success',
                  'Debugger attached'
              )
          )
      } else {
          // sam local either failed, or took too long to start up
          this.outputChannel.appendLine(
              localize(
                  'AWS.output.sam.local.attach.failure',
                  // tslint:disable-next-line:max-line-length
                  'Unable to attach Debugger. Check the Terminal tab for output. If it took longer than expected to successfully start, you may still attach to it.'
              )
          )
      }
  }
}
