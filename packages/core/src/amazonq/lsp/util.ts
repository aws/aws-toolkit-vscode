/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fs } from '../../shared/fs/fs'

export async function getDownloadedVersions(installLocation: string) {
    return (await fs.readdir(installLocation)).map(([f, _], __) => f)
}
