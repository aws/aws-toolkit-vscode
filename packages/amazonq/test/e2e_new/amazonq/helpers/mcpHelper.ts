/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By, WebElement } from 'vscode-extension-tester'
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
 * Note: I have the default settings in the defaultConfig
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

const defaultConfig: MCPServerConfig = {
    scope: 'global',
    name: 'aws-documentation',
    transport: 0,
    command: 'uvx',
    args: ['awslabs.aws-documentation-mcp-server@latest'],
    nameEnvironmentVariable: 'hi',
    valueEnvironmentVariable: 'hi',
    timeout: 0,
}

const formItemsMap = {
    SCOPE: 0,
    NAME: 1,
    TRANSPORT: 2,
    COMMAND: 3,
    ARGS: 4,
    ENV_VARS: 6,
    TIMEOUT: 9,
} as const

type McpFormItem = keyof typeof formItemsMap

async function selectScope(container: WebElement, scope: string) {
    try {
        const a = await container.findElements(By.css('.mynah-form-input-radio-label.mynah-ui-clickable-item'))
        if (scope === 'global') {
            const b = a[0]
            await b.click()
        } else {
            const b = a[1]
            await b.click()
        }
    } catch (e) {
        console.error('Error selecting the scope:', e)
        throw e
    }
}

async function inputName(container: WebElement, name: string) {
    try {
        const input = container.findElement(By.css('.mynah-form-input'))
        await input.sendKeys(name)
    } catch (e) {
        console.error('Error inputing the name:', e)
        throw e
    }
}

async function selectTransport(container: WebElement, transport: number) {
    try {
        const selectElement = await container.findElement(By.css('select'))
        const options = await selectElement.findElements(By.css('option'))
        const optionIndex = transport
        await options[optionIndex].click()
    } catch (e) {
        console.error('Error selecting the transport:', e)
        throw e
    }
}

async function inputCommand(container: WebElement, command: string) {
    try {
        const input = container.findElement(By.css('.mynah-form-input'))
        await input.sendKeys(command)
    } catch (e) {
        console.error('Error inputing the command:', e)
        throw e
    }
}

async function inputArgs(container: WebElement, args: string[]) {
    try {
        const input = container.findElement(By.css('.mynah-form-input'))
        const addButton = container.findElement(
            By.css(
                '.mynah-button.mynah-button-secondary.fill-state-always.mynah-form-item-list-row-remove-button.mynah-ui-clickable-item'
            )
        )
        for (let i = 0; i < args.length; i++) {
            await input.sendKeys(args[i])
            await addButton.click()
        }
    } catch (e) {
        console.error('Error inputing the arguments:', e)
        throw e
    }
}

async function inputEnvironmentVariables(
    container: WebElement,
    nameEnvironmentVariable?: string,
    valueEnvironmentVariable?: string
) {
    try {
        if (nameEnvironmentVariable && valueEnvironmentVariable) {
            const a = await container.findElements(By.css('.mynah-form-input'))
            await a[0].sendKeys(nameEnvironmentVariable)
            await a[1].sendKeys(valueEnvironmentVariable)
            const addButton = await container.findElement(By.css('.mynah-form-item-list-add-button'))
            await addButton.click()
        } else {
            console.log('No environmental variables for this configuration')
        }
    } catch (e) {
        console.error('Error inputing the environment variables:', e)
        throw e
    }
}

async function inputTimeout(container: WebElement, timeout: number) {
    try {
        const input = container.findElement(By.css('.mynah-form-input'))
        await input.clear()
        await input.sendKeys(timeout)
    } catch (e) {
        console.error('Error inputing the timeout:', e)
        throw e
    }
}

async function processFormItems(mcpFormItem: McpFormItem, container: WebElement, config: MCPServerConfig) {
    switch (mcpFormItem) {
        case 'SCOPE':
            await selectScope(container, config.scope!)
            break
        case 'NAME':
            await inputName(container, config.name!)
            break
        case 'TRANSPORT':
            await selectTransport(container, config.transport!)
            break
        case 'COMMAND':
            await inputCommand(container, config.command!)
            break
        case 'ARGS':
            await inputArgs(container, config.args!)
            break
        case 'ENV_VARS':
            await inputEnvironmentVariables(container, config.nameEnvironmentVariable, config.valueEnvironmentVariable)
            break
        case 'TIMEOUT':
            await inputTimeout(container, config.timeout!)
            break
    }
}

export async function configureMCPServer(webviewView: WebviewView, config: MCPServerConfig = {}): Promise<boolean> {
    const mergedConfig = { ...defaultConfig, ...config }
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const sheetBody = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filtersWrapper = await sheetBody.findElement(By.css('.mynah-detailed-list-filters-wrapper'))
        const formContainer = await filtersWrapper.findElement(By.css('.mynah-chat-item-form-items-container'))
        const items = await formContainer.findElements(By.css('.mynah-form-input-wrapper'))

        for (const [formItem, index] of Object.entries(formItemsMap)) {
            if (index < items.length) {
                await processFormItems(formItem as McpFormItem, items[index], mergedConfig)
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
