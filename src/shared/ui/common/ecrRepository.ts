/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcrClient, EcrRepository } from '../../clients/ecrClient'
import { WizardControl, WIZARD_BACK } from '../../wizards/wizard'
import { WizardForm } from '../../wizards/wizardForm'
import { createBackButton, createExitButton, createHelpButton, QuickInputButton } from '../buttons'
import * as nls from 'vscode-nls'
import { createLabelQuickPick, createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { toArrayAsync } from '../../utilities/collectionUtils'
import { getLogger } from '../../logger'

const localize = nls.loadMessageBundle()

export type TaggedEcrRepository = EcrRepository & { tag: string }

const PUBLIC_ECR = 'public.ecr.aws'

function makeButtons() {
    return [createHelpButton(), createBackButton(), createExitButton()]
}

function createTagPrompter(
    ecrClient: EcrClient,
    imageRepo: EcrRepository,
    cache: { [key: string]: any }
): QuickPickPrompter<string> {
    const last: DataQuickPickItem<TaggedEcrRepository>[] = cache[imageRepo.repositoryName]
    const tagItems =
        last ??
        toArrayAsync(ecrClient.describeTags(imageRepo.repositoryName))
            .then(tags => {
                if (tags.length === 0) {
                    return [
                        {
                            label: localize('AWS.apprunner.createService.selectTags.noFound', 'No tags found'),
                            description: localize('AWS.generic.goBack', 'Click to go back'),
                            data: WIZARD_BACK,
                        },
                    ]
                }

                const tagT = tags.map(tag => ({ label: tag }))
                cache[imageRepo.repositoryName] = tagT
                return tagT
            })
            .catch(err => {
                getLogger().error(`Unabled to list tags for repository "${imageRepo.repositoryName}": %O`, err)
                return [
                    {
                        label: localize(
                            'AWS.apprunner.createService.selectTag.failed',
                            'Failed to get tags for repository'
                        ),
                        description: localize('AWS.generic.goBack', 'Click to go back'),
                        data: WIZARD_BACK,
                    },
                ]
            })

    return createLabelQuickPick(tagItems, {
        title: localize('AWS.apprunner.createService.selectTag.title', 'Select an ECR tag'),
        placeholder: 'latest',
        buttons: makeButtons(),
    })
}

function createImagePrompter(
    ecrClient: EcrClient,
    cache: { [key: string]: any },
    options: ImagePrompterOptions = {}
): QuickPickPrompter<TaggedEcrRepository> {
    const last = cache['repos']
    const imageRepos =
        last ??
        toArrayAsync(ecrClient.describeRepositories())
            .then(resp => {
                const repos = resp.map(repo => ({ label: repo.repositoryName, detail: repo.repositoryUri, data: repo }))
                cache['repos'] = repos
                return repos
            })
            .catch(err => {
                getLogger().error(`Unabled to list repositories: %O`, err)
                return [
                    {
                        label: localize(
                            'AWS.apprunner.createService.selectImageRepo.failed',
                            'Failed to list repositories'
                        ),
                        description: localize('AWS.generic.goBack', 'Click to go back'),
                        data: WIZARD_BACK,
                    },
                ]
            })

    const customUserInputLabel = localize('AWS.apprunner.createService.selectImageRepo.input', 'Custom ECR URL')
    const customUserInputTransform = (resp: string) => {
        const userInputParts = resp.split(':')

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
        return message !== undefined ? `$(close) Invalid input: ${message}` : undefined
    }

    return createQuickPick<TaggedEcrRepository>(imageRepos, {
        title: localize('AWS.apprunner.createService.selectImageRepo.title', 'Select or enter an image repository'),
        placeholder: '123456789012.dkr.ecr.us-east-1.amazonaws.com/myrepo:latest',
        filterBoxInputSettings: {
            label: customUserInputLabel,
            transform: customUserInputTransform,
            validator: customUserInputValidator,
        },
        buttons: makeButtons(),
    })
}

interface ImagePrompterOptions {
    noPublicMessage?: string
    extraButtons?: QuickInputButton<void | WizardControl>
    promptTitle?: string
}

export class EcrRepositoryForm extends WizardForm<{ repo: TaggedEcrRepository }> {
    constructor(ecrClient: EcrClient, options: ImagePrompterOptions = {}) {
        super()

        this.body.repo.bindPrompter(state => createImagePrompter(ecrClient, state.stepCache, options))
        this.body.repo.tag.bindPrompter(state => createTagPrompter(ecrClient, state.repo, state.stepCache), {
            dependencies: [this.body.repo],
        })
    }
}
