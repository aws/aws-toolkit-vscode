/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { samDeployUrl } from '../../../shared/constants'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { DataQuickPickItem, createQuickPick } from '../../../shared/ui/pickerPrompter'
import * as nls from 'vscode-nls'
import { Wizard } from '../../../shared/wizards/wizard'
import { DeployParams, DeployWizard } from '../../../shared/sam/deploy'
import { SyncParams, SyncWizard } from '../../../shared/sam/sync'
import { WizardPrompter } from '../../../shared/ui/wizardPrompter'
import { createExitPrompter } from '../../../shared/ui/common/exitPrompter'
const localize = nls.loadMessageBundle()

export class DeployTypeWizard extends Wizard<{
    choice: string
    syncParam: SyncParams
    deployParam: DeployParams
}> {
    public constructor(syncWizard: SyncWizard, deployWizard: DeployWizard) {
        super({ exitPrompterProvider: createExitPrompter })
        const form = this.form

        const items: DataQuickPickItem<string>[] = [
            {
                label: 'Sync',
                data: 'sync',
                detail: 'Speed up your development and testing experience in the AWS Cloud. With the --watch parameter, sync will build, deploy and watch for local changes',
                description: 'Development environments',
            },
            {
                label: 'Deploy',
                data: 'deploy',
                detail: 'Deploys your template through CloudFormation',
                description: 'Production environments',
            },
        ]
        form.choice.bindPrompter(() => {
            return createQuickPick(items, {
                title: localize('AWS.appBuilder.deployType.title', 'Select deployment command'),
                placeholder: 'Press enter to proceed with highlighted option',
                buttons: createCommonButtons(samDeployUrl),
            })
        })
        form.deployParam.bindPrompter((state) => new WizardPrompter(deployWizard), {
            showWhen: (state) => state.choice === 'deploy',
        })
        form.syncParam.bindPrompter((state) => new WizardPrompter(syncWizard), {
            showWhen: (state) => state.choice === 'sync',
        })
    }
}
