/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Experiments } from '../../../shared/settings'

export class ConsolasSettings extends Experiments {
    public async isEnabled(): Promise<boolean> {
        return await this.isExperimentEnabled('Consolas')
    }
}
