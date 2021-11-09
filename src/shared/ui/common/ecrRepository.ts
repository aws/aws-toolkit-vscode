/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcrClient, EcrRepository } from '../../clients/ecrClient'
import { createCommonButtons } from '../buttons'
import * as nls from 'vscode-nls'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'
import { partialCached } from '../../utilities/collectionUtils'
import { Wizard } from '../../wizards/wizard'
import { BasicExitPrompter } from './basicExit'
import { ext } from '../../extensionGlobals'
import { WizardPrompter } from '../wizardPrompter'

const localize = nls.loadMessageBundle()

export type TaggedEcrRepository = EcrRepository & { tag: string }

const PUBLIC_ECR = 'public.ecr.aws'

async function* loadTags(ecrClient: EcrClient, repo: EcrRepository) {
    for await (const page of ecrClient.describeTags(repo.repositoryName)) {
        yield { label: page, data: page }
    }
}

async function* loadRepositories(ecrClient: EcrClient) {
    for await (const repo of ecrClient.describeRepositories()) {
        yield {
            label: repo.repositoryName,
            detail: repo.repositoryUri,
            data: repo as TaggedEcrRepository,
        }
    }
}

export function createTagPrompter(ecrClient: EcrClient, repo: EcrRepository): QuickPickPrompter<string> {
    return createQuickPick([], {
        itemLoader: partialCached((repo: EcrRepository) => loadTags(ecrClient, repo), repo),
        title: localize('AWS.apprunner.createService.selectTag.title', 'Select an ECR tag'),
        placeholder: 'latest',
        buttons: createCommonButtons(),
        noItemsFoundItem: localize('AWS.apprunner.createService.selectTags.noFound', 'No tags found'),
        errorItem: localize('AWS.apprunner.createService.selectTag.failed', 'Failed to get tags'),
    })
}

export function createImagePrompter(
    ecrClient: EcrClient,
    options: ImagePrompterOptions = {}
): QuickPickPrompter<TaggedEcrRepository> {
    const customUserInputLabel = localize('AWS.apprunner.createService.selectImageRepo.input', 'ECR URL')
    const customUserInputTransform = (resp: string) => {
        const userInputParts = resp.split(':')

        // TODO: validate this prior to continuing the flow, that way we don't need to fill with dummy data
        return {
            repositoryArn: '',
            repositoryName: 'UserDefined',
            repositoryUri: userInputParts[0],
            tag: userInputParts[1]?.trim() ?? 'latest',
        }
    }

    const ecrUriValidator = (input: string) => {
        const userInputParts = input.split(':')

        if (userInputParts.length > 2) {
            return 'colon should be used to delimit tag'
        }

        if (userInputParts.length === 2 && userInputParts[1].trim() === '') {
            return 'tag cannot be empty'
        }

        const privateRegExp = /[0-9]+\.dkr\.ecr\.[a-zA-z0-9\-]+\.amazonaws\.com/

        if (options.noPublicMessage && userInputParts[0].startsWith(PUBLIC_ECR)) {
            return options.noPublicMessage
        }

        if (!userInputParts[0].startsWith(PUBLIC_ECR) && !userInputParts[0].match(privateRegExp)) {
            return 'not a valid ECR URL'
        }
    }

    const customUserInputValidator = (input: string) => {
        const message = ecrUriValidator(input)
        return message !== undefined ? `$(error) Invalid input: ${message}` : undefined
    }

    return createQuickPick([], {
        itemLoader: partialCached((region?: string) => loadRepositories(ecrClient), ecrClient.regionCode),
        title:
            options.title ??
            localize('AWS.apprunner.createService.selectImageRepo.title', 'Select or enter an image repository'),
        placeholder: '123456789012.dkr.ecr.us-east-1.amazonaws.com/myrepo:latest',
        filterBoxInput: {
            label: customUserInputLabel,
            transform: customUserInputTransform,
            validator: customUserInputValidator,
        },
        buttons: createCommonButtons(),
        errorItem: localize('AWS.apprunner.createService.selectImageRepo.failed', 'Failed to list repositories'),
    })
}

interface ImagePrompterOptions {
    title?: string
    noPublicMessage?: string
}

export class EcrRepositoryWizard extends Wizard<{ repo: TaggedEcrRepository }> {
    constructor(ecrClient: EcrClient, options: ImagePrompterOptions = {}) {
        super({ exitPrompter: BasicExitPrompter })

        this.form.repo.bindPrompter(() => createImagePrompter(ecrClient, options))
        this.form.repo.tag.bindPrompter(state => createTagPrompter(ecrClient, state.repo), {
            // TODO: restructure this wizard state to not need to do this or add logic to the core wizard code
            // we use a clause to prevent early assignment, otherwise we might prompt for tags despite being provided
            showWhen: state => !!state.repo,
            dependencies: [this.form.repo],
        })
    }
}

export function createEcrPrompter(regionOrClient: string | EcrClient, options?: ImagePrompterOptions) {
    const client =
        typeof regionOrClient === 'string' ? ext.toolkitClientBuilder.createEcrClient(regionOrClient) : regionOrClient
    return new WizardPrompter(new EcrRepositoryWizard(client, options))
}
