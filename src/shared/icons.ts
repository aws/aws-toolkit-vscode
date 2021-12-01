/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from './extensionGlobals'
import { isCloud9 } from './extensionUtilities'

// TODO: either make this not mutate the global object or allow individual features to contribute to the globals module
// globals aren't bad per-se but they need to be handled carefully since static analysis is much more difficult
// also, we can just generate interfaces/paths instead of hard-coding everything
export function initializeIconPaths(context: vscode.ExtensionContext) {
    globals.iconPaths.dark.help = isCloud9()
        ? context.asAbsolutePath('resources/dark/cloud9/help.svg')
        : context.asAbsolutePath('resources/dark/help.svg')
    globals.iconPaths.light.help = isCloud9()
        ? context.asAbsolutePath('resources/light/cloud9/help.svg')
        : context.asAbsolutePath('resources/light/help.svg')

    globals.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cloudformation.svg')
    globals.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cloudformation.svg')

    globals.iconPaths.dark.ecr = context.asAbsolutePath('resources/dark/ecr.svg')
    globals.iconPaths.light.ecr = context.asAbsolutePath('resources/light/ecr.svg')

    globals.iconPaths.dark.lambda = context.asAbsolutePath('resources/dark/lambda.svg')
    globals.iconPaths.light.lambda = context.asAbsolutePath('resources/light/lambda.svg')

    globals.iconPaths.dark.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/dark/gear.svg')
    globals.iconPaths.light.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/light/gear.svg')

    globals.iconPaths.dark.registry = context.asAbsolutePath('resources/dark/registry.svg')
    globals.iconPaths.light.registry = context.asAbsolutePath('resources/light/registry.svg')

    globals.iconPaths.dark.s3 = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    globals.iconPaths.light.s3 = context.asAbsolutePath('resources/light/s3/bucket.svg')

    globals.iconPaths.dark.folder = context.asAbsolutePath('third-party/resources/from-vscode/dark/folder.svg')
    globals.iconPaths.light.folder = context.asAbsolutePath('third-party/resources/from-vscode/light/folder.svg')

    globals.iconPaths.dark.file = context.asAbsolutePath('third-party/resources/from-vscode/dark/document.svg')
    globals.iconPaths.light.file = context.asAbsolutePath('third-party/resources/from-vscode/light/document.svg')

    globals.iconPaths.dark.schema = context.asAbsolutePath('resources/dark/schema.svg')
    globals.iconPaths.light.schema = context.asAbsolutePath('resources/light/schema.svg')

    globals.iconPaths.dark.apprunner = context.asAbsolutePath('resources/dark/apprunner.svg')
    globals.iconPaths.light.apprunner = context.asAbsolutePath('resources/light/apprunner.svg')

    globals.iconPaths.dark.statemachine = context.asAbsolutePath('resources/dark/stepfunctions/preview.svg')
    globals.iconPaths.light.statemachine = context.asAbsolutePath('resources/light/stepfunctions/preview.svg')

    globals.iconPaths.dark.cloudWatchLogGroup = context.asAbsolutePath('resources/dark/log-group.svg')
    globals.iconPaths.light.cloudWatchLogGroup = context.asAbsolutePath('resources/light/log-group.svg')

    globals.iconPaths.dark.createBucket = context.asAbsolutePath('resources/dark/s3/create-bucket.svg')
    globals.iconPaths.light.createBucket = context.asAbsolutePath('resources/light/s3/create-bucket.svg')

    globals.iconPaths.dark.bucket = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    globals.iconPaths.light.bucket = context.asAbsolutePath('resources/light/s3/bucket.svg')

    globals.iconPaths.dark.thing = context.asAbsolutePath('resources/dark/iot/thing.svg')
    globals.iconPaths.light.thing = context.asAbsolutePath('resources/light/iot/thing.svg')

    globals.iconPaths.dark.certificate = context.asAbsolutePath('resources/dark/iot/certificate.svg')
    globals.iconPaths.light.certificate = context.asAbsolutePath('resources/light/iot/certificate.svg')

    globals.iconPaths.dark.policy = context.asAbsolutePath('resources/dark/iot/policy.svg')
    globals.iconPaths.light.policy = context.asAbsolutePath('resources/light/iot/policy.svg')

    globals.iconPaths.light.cluster = context.asAbsolutePath('resources/light/ecs/cluster.svg')
    globals.iconPaths.dark.cluster = context.asAbsolutePath('resources/dark/ecs/cluster.svg')

    globals.iconPaths.light.service = context.asAbsolutePath('resources/light/ecs/service.svg')
    globals.iconPaths.dark.service = context.asAbsolutePath('resources/dark/ecs/service.svg')

    globals.iconPaths.light.container = context.asAbsolutePath('resources/light/ecs/container.svg')
    globals.iconPaths.dark.container = context.asAbsolutePath('resources/dark/ecs/container.svg')

    // temporary icons while Cloud9 does not have Codicon support
    globals.iconPaths.dark.plus = context.asAbsolutePath('resources/dark/plus.svg')
    globals.iconPaths.light.plus = context.asAbsolutePath('resources/light/plus.svg')

    globals.iconPaths.dark.edit = context.asAbsolutePath('resources/dark/edit.svg')
    globals.iconPaths.light.edit = context.asAbsolutePath('resources/light/edit.svg')

    globals.iconPaths.dark.sync = context.asAbsolutePath('resources/dark/sync.svg')
    globals.iconPaths.light.sync = context.asAbsolutePath('resources/light/sync.svg')

    globals.iconPaths.dark.syncIgnore = context.asAbsolutePath('resources/dark/sync-ignore.svg')
    globals.iconPaths.light.syncIgnore = context.asAbsolutePath('resources/light/sync-ignore.svg')

    globals.iconPaths.dark.refresh = context.asAbsolutePath('resources/dark/refresh.svg')
    globals.iconPaths.light.refresh = context.asAbsolutePath('resources/light/refresh.svg')

    globals.iconPaths.dark.exit = context.asAbsolutePath('resources/dark/exit.svg')
    globals.iconPaths.light.exit = context.asAbsolutePath('resources/light/exit.svg')
}
