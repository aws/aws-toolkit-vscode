/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Customization, Customizations } from '../codewhisperer/client/codewhispereruserclient'
import {
    getAvailableCustomizationsList,
    getSelectedCustomization,
    setSelectedCustomization,
} from '../codewhisperer/util/customizationUtil'

export interface AwsToolkitApi {
    setCustomization(customization: Customization): Promise<boolean>
    getSelectedCustomization(): Customization
    listAvailableCustomizations(): Promise<Customizations>
}

export function buildApi(): AwsToolkitApi {
    return {
        setCustomization: async (customization: Customization) => {
            try {
                await setSelectedCustomization(customization)
                return true
            } catch (e) {
                return false
            }
        },
        getSelectedCustomization: () => {
            return getSelectedCustomization()
        },
        listAvailableCustomizations: async () => {
            return getAvailableCustomizationsList()
        },
    }
}
