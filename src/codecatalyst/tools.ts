/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { VscodeRemoteSshConfig } from '../shared/sshConfig'

export class CodeCatalystSshConfig extends VscodeRemoteSshConfig {
    protected override readonly proxyCommandRegExp: RegExp = /proxycommand.{0,1024}codecatalyst_connect(.ps1)?.{0,99}/i
}
