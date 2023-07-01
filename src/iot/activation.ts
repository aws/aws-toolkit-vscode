/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IotThingNode } from './explorer/iotThingNode'
import { ExtContext } from '../shared/extensions'
import { IotThingFolderNode } from './explorer/iotThingFolderNode'
import { createThingCommand } from './commands/createThing'
import { deleteThingCommand } from './commands/deleteThing'
import { IotCertificateNode, IotCertWithPoliciesNode, IotThingCertNode } from './explorer/iotCertificateNode'
import { detachThingCertCommand } from './commands/detachCert'
import { IotPolicyCertNode, IotPolicyWithVersionsNode } from './explorer/iotPolicyNode'
import { detachPolicyCommand } from './commands/detachPolicy'
import { deletePolicyCommand } from './commands/deletePolicy'
import {
    activateCertificateCommand,
    deactivateCertificateCommand,
    revokeCertificateCommand,
} from './commands/updateCert'
import { deleteCertCommand } from './commands/deleteCert'
import { IotCertsFolderNode } from './explorer/iotCertFolderNode'
import { createCertificateCommand } from './commands/createCert'
import { attachCertificateCommand } from './commands/attachCertificate'
import { attachPolicyCommand } from './commands/attachPolicy'
import { IotPolicyFolderNode } from './explorer/iotPolicyFolderNode'
import { createPolicyCommand } from './commands/createPolicy'
import { IotNode } from './explorer/iotNodes'
import { copyEndpointCommand } from './commands/copyEndpoint'
import { IotPolicyVersionNode } from './explorer/iotPolicyVersionNode'
import { deletePolicyVersionCommand } from './commands/deletePolicyVersion'
import { setDefaultPolicy } from './commands/setDefaultPolicy'
import { createPolicyVersionCommand } from './commands/createPolicyVersion'
import { viewPolicyVersionCommand } from './commands/viewPolicyVersion'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activate IoT components.
 */
export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register('aws.iot.createThing', async (node: IotThingFolderNode) => {
            await createThingCommand(node)
        }),
        Commands.register('aws.iot.deleteThing', async (node: IotThingNode) => {
            await deleteThingCommand(node)
        }),
        Commands.register('aws.iot.createCert', async (node: IotCertsFolderNode) => {
            await createCertificateCommand(node)
        }),
        Commands.register('aws.iot.deleteCert', async (node: IotCertWithPoliciesNode) => {
            await deleteCertCommand(node)
        }),
        Commands.register('aws.iot.attachCert', async (node: IotThingNode) => {
            await attachCertificateCommand(node)
        }),
        Commands.register('aws.iot.detachCert', async (node: IotThingCertNode) => {
            await detachThingCertCommand(node)
        }),
        Commands.register('aws.iot.createPolicy', async (node: IotPolicyFolderNode) => {
            await createPolicyCommand(node)
        }),
        Commands.register('aws.iot.deletePolicy', async (node: IotPolicyWithVersionsNode) => {
            await deletePolicyCommand(node)
        }),
        Commands.register('aws.iot.attachPolicy', async (node: IotCertWithPoliciesNode) => {
            await attachPolicyCommand(node)
        }),
        Commands.register('aws.iot.detachPolicy', async (node: IotPolicyCertNode) => {
            await detachPolicyCommand(node)
        }),
        Commands.register('aws.iot.activateCert', async (node: IotCertificateNode) => {
            await activateCertificateCommand(node)
        }),
        Commands.register('aws.iot.deactivateCert', async (node: IotCertificateNode) => {
            await deactivateCertificateCommand(node)
        }),
        Commands.register('aws.iot.revokeCert', async (node: IotCertificateNode) => {
            await revokeCertificateCommand(node)
        }),
        Commands.register('aws.iot.createPolicyVersion', async (node: IotPolicyWithVersionsNode) => {
            await createPolicyVersionCommand(node)
        }),
        Commands.register('aws.iot.deletePolicyVersion', async (node: IotPolicyVersionNode) => {
            await deletePolicyVersionCommand(node)
        }),
        Commands.register('aws.iot.setDefaultPolicy', async (node: IotPolicyVersionNode) => {
            await setDefaultPolicy(node)
        }),
        Commands.register('aws.iot.viewPolicyVersion', async (node: IotPolicyVersionNode) => {
            await viewPolicyVersionCommand(node)
        }),
        Commands.register('aws.iot.copyEndpoint', async (node: IotNode) => {
            await copyEndpointCommand(node)
        })
    )
}
