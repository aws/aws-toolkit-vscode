/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormationTemplateRegistry } from '../../../shared/fs/templateRegistry'
import { createTemplatePrompter, TemplateItem } from '../../../shared/sam/sync'
import { createExitPrompter } from '../../../shared/ui/common/exitPrompter'
import { Wizard } from '../../../shared/wizards/wizard'

export interface OpenTemplateParams {
    readonly template: TemplateItem
}

export class OpenTemplateWizard extends Wizard<OpenTemplateParams> {
    public constructor(state: Partial<OpenTemplateParams>, registry: CloudFormationTemplateRegistry) {
        super({ initState: state, exitPrompterProvider: createExitPrompter })
        this.form.template.bindPrompter(() => createTemplatePrompter(registry))
    }
}
