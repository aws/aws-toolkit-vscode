/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isCloud9 } from '../../../shared/extensionUtilities'

export interface IconPath {
    light: vscode.Uri
    dark: vscode.Uri
}

export function initializeIconPaths(context: vscode.ExtensionContext): typeof ext['iconPaths'] {
    const iconPaths = { dark: {}, light: {} } as typeof ext['iconPaths']

    iconPaths.dark.help = isCloud9()
        ? context.asAbsolutePath('resources/dark/cloud9/help.svg')
        : context.asAbsolutePath('resources/dark/help.svg')
    iconPaths.light.help = isCloud9()
        ? context.asAbsolutePath('resources/light/cloud9/help.svg')
        : context.asAbsolutePath('resources/light/help.svg')

    iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cloudformation.svg')
    iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cloudformation.svg')

    iconPaths.dark.ecr = context.asAbsolutePath('resources/dark/ecr.svg')
    iconPaths.light.ecr = context.asAbsolutePath('resources/light/ecr.svg')

    iconPaths.dark.lambda = context.asAbsolutePath('resources/dark/lambda.svg')
    iconPaths.light.lambda = context.asAbsolutePath('resources/light/lambda.svg')

    iconPaths.dark.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/dark/gear.svg')
    iconPaths.light.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/light/gear.svg')

    iconPaths.dark.registry = context.asAbsolutePath('resources/dark/registry.svg')
    iconPaths.light.registry = context.asAbsolutePath('resources/light/registry.svg')

    iconPaths.dark.s3 = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    iconPaths.light.s3 = context.asAbsolutePath('resources/light/s3/bucket.svg')

    iconPaths.dark.folder = context.asAbsolutePath('third-party/resources/from-vscode/dark/folder.svg')
    iconPaths.light.folder = context.asAbsolutePath('third-party/resources/from-vscode/light/folder.svg')

    iconPaths.dark.file = context.asAbsolutePath('third-party/resources/from-vscode/dark/document.svg')
    iconPaths.light.file = context.asAbsolutePath('third-party/resources/from-vscode/light/document.svg')

    iconPaths.dark.schema = context.asAbsolutePath('resources/dark/schema.svg')
    iconPaths.light.schema = context.asAbsolutePath('resources/light/schema.svg')

    iconPaths.dark.apprunner = context.asAbsolutePath('resources/dark/apprunner.svg')
    iconPaths.light.apprunner = context.asAbsolutePath('resources/light/apprunner.svg')

    iconPaths.dark.statemachine = context.asAbsolutePath('resources/dark/stepfunctions/preview.svg')
    iconPaths.light.statemachine = context.asAbsolutePath('resources/light/stepfunctions/preview.svg')

    iconPaths.dark.cloudWatchLogGroup = context.asAbsolutePath('resources/dark/log-group.svg')
    iconPaths.light.cloudWatchLogGroup = context.asAbsolutePath('resources/light/log-group.svg')

    iconPaths.dark.createBucket = context.asAbsolutePath('resources/dark/s3/create-bucket.svg')
    iconPaths.light.createBucket = context.asAbsolutePath('resources/light/s3/create-bucket.svg')

    iconPaths.dark.bucket = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    iconPaths.light.bucket = context.asAbsolutePath('resources/light/s3/bucket.svg')

    iconPaths.dark.thing = context.asAbsolutePath('resources/dark/iot/thing.svg')
    iconPaths.light.thing = context.asAbsolutePath('resources/light/iot/thing.svg')

    iconPaths.dark.certificate = context.asAbsolutePath('resources/dark/iot/certificate.svg')
    iconPaths.light.certificate = context.asAbsolutePath('resources/light/iot/certificate.svg')

    iconPaths.dark.policy = context.asAbsolutePath('resources/dark/iot/policy.svg')
    iconPaths.light.policy = context.asAbsolutePath('resources/light/iot/policy.svg')

    iconPaths.light.cluster = context.asAbsolutePath('resources/light/ecs/cluster.svg')
    iconPaths.dark.cluster = context.asAbsolutePath('resources/dark/ecs/cluster.svg')

    iconPaths.light.service = context.asAbsolutePath('resources/light/ecs/service.svg')
    iconPaths.dark.service = context.asAbsolutePath('resources/dark/ecs/service.svg')

    iconPaths.light.container = context.asAbsolutePath('resources/light/ecs/container.svg')
    iconPaths.dark.container = context.asAbsolutePath('resources/dark/ecs/container.svg')

    // temporary icons while Cloud9 does not have Codicon support
    iconPaths.dark.plus = context.asAbsolutePath('resources/dark/plus.svg')
    iconPaths.light.plus = context.asAbsolutePath('resources/light/plus.svg')

    iconPaths.dark.edit = context.asAbsolutePath('resources/dark/edit.svg')
    iconPaths.light.edit = context.asAbsolutePath('resources/light/edit.svg')

    iconPaths.dark.sync = context.asAbsolutePath('resources/dark/sync.svg')
    iconPaths.light.sync = context.asAbsolutePath('resources/light/sync.svg')

    iconPaths.dark.syncIgnore = context.asAbsolutePath('resources/dark/sync-ignore.svg')
    iconPaths.light.syncIgnore = context.asAbsolutePath('resources/light/sync-ignore.svg')

    iconPaths.dark.refresh = context.asAbsolutePath('resources/dark/refresh.svg')
    iconPaths.light.refresh = context.asAbsolutePath('resources/light/refresh.svg')

    iconPaths.dark.exit = context.asAbsolutePath('resources/dark/exit.svg')
    iconPaths.light.exit = context.asAbsolutePath('resources/light/exit.svg')

    return iconPaths
}

export function setupTestIconPaths() {
    ext.iconPaths.dark.help = '/icons/dark/help'
    ext.iconPaths.light.help = '/icons/light/help'

    ext.iconPaths.dark.cloudFormation = '/icons/dark/cloudformation'
    ext.iconPaths.light.cloudFormation = '/icons/light/cloudformation'

    ext.iconPaths.dark.cloudWatchLogGroup = '/icons/dark/cloudWatchLogGroup'
    ext.iconPaths.light.cloudWatchLogGroup = '/icons/light/cloudWatchLogGroup'

    ext.iconPaths.dark.lambda = '/icons/dark/lambda'
    ext.iconPaths.light.lambda = '/icons/light/lambda'

    ext.iconPaths.dark.settings = '/icons/dark/settings'
    ext.iconPaths.light.settings = '/icons/light/settings'

    ext.iconPaths.dark.registry = '/icons/dark/registry'
    ext.iconPaths.light.registry = '/icons/light/registry'

    ext.iconPaths.dark.s3 = '/icons/dark/s3'
    ext.iconPaths.light.s3 = '/icons/light/s3'

    ext.iconPaths.dark.folder = '/icons/dark/folder'
    ext.iconPaths.light.folder = '/icons/light/folder'

    ext.iconPaths.dark.file = '/icons/dark/file'
    ext.iconPaths.light.file = '/icons/light/file'

    ext.iconPaths.dark.schema = '/icons/dark/schema'
    ext.iconPaths.light.schema = '/icons/light/schema'
}

export function clearTestIconPaths() {
    ext.iconPaths.dark.help = ''
    ext.iconPaths.light.help = ''

    ext.iconPaths.dark.cloudFormation = ''
    ext.iconPaths.light.cloudFormation = ''

    ext.iconPaths.dark.lambda = ''
    ext.iconPaths.light.lambda = ''

    ext.iconPaths.dark.settings = ''
    ext.iconPaths.light.settings = ''

    ext.iconPaths.dark.registry = ''
    ext.iconPaths.light.registry = ''

    ext.iconPaths.dark.s3 = ''
    ext.iconPaths.light.s3 = ''

    ext.iconPaths.dark.folder = ''
    ext.iconPaths.light.folder = ''

    ext.iconPaths.dark.file = ''
    ext.iconPaths.light.file = ''

    ext.iconPaths.dark.schema = ''
    ext.iconPaths.light.schema = ''
}
