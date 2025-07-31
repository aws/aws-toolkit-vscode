/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { waitForElement } from '../utils/generalUtils'

/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function clickToolsButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const navWrapper = await waitForElement(webviewView, By.css('.mynah-nav-tabs-wrapper.mynah-ui-clickable-item'))
        const buttonsWrapper = await navWrapper.findElement(By.css('.mynah-nav-tabs-bar-buttons-wrapper'))
        const buttons = await buttonsWrapper.findElements(
            By.css('.mynah-button.mynah-button-secondary.fill-state-always.mynah-ui-clickable-item')
        )
        for (const button of buttons) {
            const icon = await button.findElement(By.css('i.mynah-ui-icon.mynah-ui-icon-tools'))
            if (icon) {
                await button.click()
                await webviewView.getDriver().actions().move({ x: 0, y: 0 }).perform()
                return true
            }
        }
        console.log('Tools button not found')
        return false
    } catch (e) {
        console.error('Error clicking tools button:', e)
        return false
    }
}

/**
 * Clicks the add button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if add button was found and clicked, false otherwise
 */
export async function clickMCPAddButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const header = await sheetWrapper.findElement(By.css('.mynah-sheet-header'))
        const actionsContainer = await header.findElement(By.css('.mynah-sheet-header-actions-container'))
        const addButton = await actionsContainer.findElement(By.css('button:has(i.mynah-ui-icon-plus)'))
        await addButton.click()
        return true
    } catch (e) {
        console.error('Error clicking the MCP add button:', e)
        return false
    }
}

/**
 * Configures an MCP server with the provided settings
 * @param webviewView The WebviewView instance
 * @param config Configuration object with optional parameters
 * @returns Promise<boolean> True if configuration was successful, false otherwise
 * Note: I have the default settings in the config variable
 */
interface MCPServerConfig {
    scope?: 'global' | 'workspace'
    name?: string
    transport?: number
    command?: string
    args?: string[]
    nameEnvironmentVariable?: string
    valueEnvironmentVariable?: string
    timeout?: number
}
export async function configureMCPServer(webviewView: WebviewView, config: MCPServerConfig = {}): Promise<boolean> {
    const {
        scope = 'workspace',
        name = 'aws-documentation',
        transport = 0,
        command = 'uvx',
        args = ['awslabs.aws-documentation-mcp-server@latest'],
        nameEnvironmentVariable = 'hi',
        valueEnvironmentVariable = 'hi',
        timeout = 0,
    } = config
    try {
        const a = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const b = await a.findElement(By.css('.mynah-sheet-body'))
        const c = await b.findElement(By.css('.mynah-detailed-list-filters-wrapper'))
        const d = await c.findElement(By.css('.mynah-chat-item-form-items-container'))
        const items = await d.findElements(By.css('.mynah-form-input-wrapper'))
        console.log('THERE ARE X ITEMS:', items.length) // returns 10 items
        for (let i = 0; i < items.length; i++) {
            switch (i) {
                // select the scope
                case 0:
                    try {
                        const scopeContainer = items[i]
                        const a = await scopeContainer.findElements(
                            By.css('.mynah-form-input-radio-label.mynah-ui-clickable-item')
                        )
                        if (scope === 'global') {
                            const b = a[0]
                            await b.click()
                        } else {
                            const b = a[1]
                            await b.click()
                        }
                    } catch (e) {
                        console.error('Error in case 0:', e)
                        throw e
                    }
                    break
                // input the name
                case 1:
                    try {
                        const scopeContainer = items[i]
                        const input = scopeContainer.findElement(By.css('.mynah-form-input'))
                        await input.sendKeys(name)
                    } catch (e) {
                        console.error('Error in case 1:', e)
                        throw e
                    }
                    break
                // select the transport (must know the index of your selection)
                case 2:
                    try {
                        const scopeContainer = items[i]
                        const selectElement = await scopeContainer.findElement(By.css('select'))
                        const options = await selectElement.findElements(By.css('option'))
                        const optionIndex = transport
                        await options[optionIndex].click()
                    } catch (e) {
                        console.error('Error in case 2:', e)
                        throw e
                    }
                    break
                // type the command
                case 3:
                    try {
                        const scopeContainer = items[i]
                        const input = scopeContainer.findElement(By.css('.mynah-form-input'))
                        await input.sendKeys(command)
                    } catch (e) {
                        console.error('Error in case 3:', e)
                        throw e
                    }
                    break
                // add arguments (NOTE: I AM PURPOSELY SKIPPING CASE 5)
                case 4:
                    try {
                        const scopeContainer = items[i]
                        const input = scopeContainer.findElement(By.css('.mynah-form-input'))
                        const addButton = scopeContainer.findElement(
                            By.css(
                                '.mynah-button.mynah-button-secondary.fill-state-always.mynah-form-item-list-row-remove-button.mynah-ui-clickable-item'
                            )
                        )
                        for (let i = 0; i < args.length; i++) {
                            await input.sendKeys(args[i])
                            await addButton.click()
                        }
                    } catch (e) {
                        console.error('Error in case 5:', e)
                        throw e
                    }
                    break
                // THE ISSUE IS THAT CASE 5 ENCOMPASSES ALL THE HTML ELEMENTS NEEDED
                case 5:
                    try {
                        if (nameEnvironmentVariable && valueEnvironmentVariable) {
                            const scopeContainer = items[i]

                            const nameContainer = items[6]
                            const inputName = nameContainer.findElement(By.css('.mynah-form-input'))
                            await inputName.sendKeys(nameEnvironmentVariable)

                            const valueContainer = items[7]
                            const inputValue = valueContainer.findElement(By.css('.mynah-form-input'))
                            await inputValue.sendKeys(valueEnvironmentVariable)
                            const addButton = scopeContainer.findElement(
                                By.css(
                                    '.mynah-button.mynah-button-secondary.fill-state-always.mynah-form-item-list-row-remove-button.mynah-ui-clickable-item'
                                )
                            )
                            await addButton.click()
                        }
                    } catch (e) {
                        console.error('Error in case 5:', e)
                        throw e
                    }
                    break
                // this timeout container goes to the environment variable
                case 9:
                    try {
                        const scopeContainer = items[i]
                        const input = scopeContainer.findElement(By.css('.mynah-form-input'))
                        await input.sendKeys(timeout)
                    } catch (e) {
                        console.error('Error in case 8:', e)
                        throw e
                    }
                    break
            }
        }
        return true
    } catch (e) {
        console.log('Error configuring the MCP Server')
        return false
    }
}

export async function saveMCPServerConfiguration(webviewView: WebviewView): Promise<boolean> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const body = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filterActions = await body.findElement(By.css('.mynah-detailed-list-filter-actions-wrapper'))
        const saveButton = await filterActions.findElement(
            By.css('.mynah-button.fill-state-always.status-primary.mynah-ui-clickable-item')
        )
        await saveButton.click()
        return true
    } catch (e) {
        console.error('Error saving the MCP server configuration:', e)
        return false
    }
}

export async function cancelMCPServerConfiguration(webviewView: WebviewView): Promise<boolean> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const body = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filterActions = await body.findElement(By.css('.mynah-detailed-list-filter-actions-wrapper'))
        const saveButton = await filterActions.findElement(
            By.css('.mynah-button.mynah-button-secondary.mynah-button-border.fill-state-always.mynah-ui-clickable-item')
        )
        await saveButton.click()
        return true
    } catch (e) {
        console.error('Error saving the MCP server configuration:', e)
        return false
    }
}

/**
 * Clicks the refresh button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if refresh button was found and clicked, false otherwise
 */
export async function clickMCPRefreshButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const header = await sheetWrapper.findElement(By.css('.mynah-sheet-header'))
        const actionsContainer = await header.findElement(By.css('.mynah-sheet-header-actions-container'))
        const refreshButton = await actionsContainer.findElement(By.css('button:has(i.mynah-ui-icon-refresh)'))
        await refreshButton.click()
        return true
    } catch (e) {
        console.error('Error clicking the MCP refresh button:', e)
        return false
    }
}

/**
 * Clicks the close/cancel button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if close button was found and clicked, false otherwise
 */
export async function clickMCPCloseButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const header = await sheetWrapper.findElement(By.css('.mynah-sheet-header'))
        const cancelButton = await header.findElement(By.css('button:has(i.mynah-ui-icon-cancel)'))
        await webviewView.getDriver().executeScript('arguments[0].click()', cancelButton)
        return true
    } catch (e) {
        console.error('Error closing the MCP overlay:', e)
        return false
    }
}
