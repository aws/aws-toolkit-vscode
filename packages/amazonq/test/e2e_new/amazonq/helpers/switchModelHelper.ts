/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { sleep, waitForElement } from '../utils/generalUtils'

/**
 * Lists all available model options in the dropdown
 * @param webviewView The WebviewView instance
 */
export async function listModels(webviewView: WebviewView): Promise<void> {
    try {
        const selectElement = await waitForElement(webviewView, By.css('.mynah-form-input.auto-width'))
        const options = await selectElement.findElements(By.css('option'))
        const optionTexts = await Promise.all(options.map(async (option) => await option.getText()))
        console.log('Available model options:', optionTexts)
    } catch (e) {
        throw new Error(`Failed to list models`)
    }
}

/**
 * Selects a specific model from the dropdown by name
 * @param webviewView The WebviewView instance
 * @param modelName The exact name of the model to select
 */
export async function selectModel(webviewView: WebviewView, modelName: string): Promise<void> {
    try {
        const selectElement = await waitForElement(webviewView, By.css('.mynah-form-input.auto-width'))
        await selectElement.click()
        const options = await selectElement.findElements(By.css('option'))
        let targetOption: WebElement | undefined
        for (const option of options) {
            const optionText = await option.getText()
            if (optionText === modelName) {
                targetOption = option
                break
            }
        }
        if (!targetOption) {
            throw new Error(`Model option "${modelName}" not found`)
        }
        await targetOption.click()
        await sleep(50)
    } catch (e) {
        throw new Error(`Failed to select model '${modelName}'`)
    }
}
