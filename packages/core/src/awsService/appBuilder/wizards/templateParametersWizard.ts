/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Wizard } from '../../../shared/wizards/wizard'
import { createExitPrompter } from '../../../shared/ui/common/exitPrompter'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { createInputBox } from '../../../shared/ui/inputPrompter'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { getRecentResponse, updateRecentResponse } from '../../../shared/sam/utils'
import { getParameters } from '../../../lambda/config/parameterUtils'

export interface TemplateParametersForm {
    [key: string]: any
}

export class TemplateParametersWizard extends Wizard<TemplateParametersForm> {
    template: vscode.Uri
    preloadedTemplate: CloudFormation.Template | undefined
    samTemplateParameters: Map<string, { required: boolean }> | undefined
    samCommandUrl: vscode.Uri
    commandMementoRootKey: string

    public constructor(template: vscode.Uri, samCommandUrl: vscode.Uri, commandMementoRootKey: string) {
        super({ exitPrompterProvider: createExitPrompter })
        this.template = template
        this.samCommandUrl = samCommandUrl
        this.commandMementoRootKey = commandMementoRootKey
    }

    public override async init(): Promise<this> {
        this.samTemplateParameters = await getParameters(this.template)
        this.preloadedTemplate = await CloudFormation.load(this.template.fsPath)
        const samTemplateNames = new Set<string>(this.samTemplateParameters?.keys() ?? [])

        samTemplateNames.forEach((name) => {
            if (this.preloadedTemplate) {
                const defaultValue = this.preloadedTemplate.Parameters
                    ? (this.preloadedTemplate.Parameters[name]?.Default as string)
                    : undefined
                this.form[name].bindPrompter(() =>
                    this.createParamPromptProvider(name, defaultValue).transform(async (item) => {
                        await updateRecentResponse(this.commandMementoRootKey, this.template.fsPath, name, item)
                        return item
                    })
                )
            }
        })

        return this
    }

    createParamPromptProvider(name: string, defaultValue: string | undefined) {
        return createInputBox({
            title: `Specify SAM Template parameter value for ${name}`,
            buttons: createCommonButtons(this.samCommandUrl),
            value: getRecentResponse(this.commandMementoRootKey, this.template.fsPath, name) ?? defaultValue,
        })
    }
}
