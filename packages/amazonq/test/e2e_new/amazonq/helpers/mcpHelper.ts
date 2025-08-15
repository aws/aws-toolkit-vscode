/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By, WebElement } from 'vscode-extension-tester'
import { clickButton, waitForElement } from '../utils/generalUtils'
import { dismissOverlayIfPresent } from '../utils/cleanupUtils'

/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function clickToolsButton(webviewView: WebviewView): Promise<void> {
    await clickButton(
        webviewView,
        '[data-testid="tab-bar-buttons-wrapper"]',
        '[data-testid="tab-bar-button"] .mynah-ui-icon-tools',
        'tools button'
    )
}

/**
 * Clicks the add button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if add button was found and clicked, false otherwise
 */
export async function clickMCPAddButton(webviewView: WebviewView): Promise<void> {
    await clickButton(webviewView, '.mynah-sheet-header-actions-container', 'i.mynah-ui-icon-plus', 'MCP add button')
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
    environmentVariable?: { name: string; value: string }
    timeout?: number
}

const defaultConfig: MCPServerConfig = {
    scope: 'global',
    name: 'aws-documentation',
    transport: 0,
    command: 'uvx',
    args: ['awslabs.aws-documentation-mcp-server@latest'],
    timeout: 0,
}

// Each name maps to an index in the '.mynah-form-input-wrapper' array
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
        const radioLabels = await container.findElements(
            By.css('.mynah-form-input-radio-label.mynah-ui-clickable-item')
        )
        if (scope === 'global') {
            const globalOption = radioLabels[0]
            await globalOption.click()
        } else {
            const workspaceOption = radioLabels[1]
            await workspaceOption.click()
        }
    } catch (e) {
        console.error('Error selecting the scope:', e)
        throw e
    }
}

async function inputName(container: WebElement, name: string) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
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
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.sendKeys(command)
    } catch (e) {
        console.error('Error inputing the command:', e)
        throw e
    }
}

async function inputArgs(container: WebElement, args: string[]) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        const addButton = await container.findElement(By.css('.mynah-form-item-list-add-button'))
        for (let i = 0; i < args.length; i++) {
            await input.sendKeys(args[i])
            await addButton.click()
        }
    } catch (e) {
        console.error('Error inputing the arguments:', e)
        throw e
    }
}

async function inputEnvironmentVariables(container: WebElement, environmentVariable?: { name: string; value: string }) {
    try {
        if (environmentVariable) {
            const envInputs = await container.findElements(By.css('.mynah-form-input'))
            await envInputs[0].sendKeys(environmentVariable.name)
            await envInputs[1].sendKeys(environmentVariable.value)
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
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.clear()
        await input.sendKeys(timeout.toString())
    } catch (e) {
        console.error('Error inputing the timeout:', e)
        throw e
    }
}

async function processFormItem(mcpFormItem: McpFormItem, container: WebElement, config: MCPServerConfig) {
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
            await inputEnvironmentVariables(container, config.environmentVariable)
            break
        case 'TIMEOUT':
            await inputTimeout(container, config.timeout!)
            break
    }
}

export async function configureMCPServer(webviewView: WebviewView, config: MCPServerConfig = {}): Promise<void> {
    const mergedConfig = { ...defaultConfig, ...config }
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const sheetBody = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filtersWrapper = await sheetBody.findElement(By.css('.mynah-detailed-list-filters-wrapper'))
        const formContainer = await filtersWrapper.findElement(By.css('.mynah-chat-item-form-items-container'))
        const items = await formContainer.findElements(By.css('.mynah-form-input-wrapper'))

        for (const formItem of Object.keys(formItemsMap) as McpFormItem[]) {
            const index = formItemsMap[formItem]
            if (index < items.length) {
                await processFormItem(formItem, items[index], mergedConfig)
            }
        }
    } catch (e) {
        console.log('Error configuring the MCP Server')
    }
}

export async function saveMCPServerConfiguration(webviewView: WebviewView): Promise<void> {
    await clickButton(
        webviewView,
        '[data-testid="chat-item-action-button"][action-id="save-mcp"]',
        'span.mynah-button-label',
        'save button'
    )
}

export async function cancelMCPServerConfiguration(webviewView: WebviewView): Promise<void> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const body = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filterActions = await body.findElement(By.css('.mynah-detailed-list-filter-actions-wrapper'))
        const saveButton = await filterActions.findElement(
            By.css('.mynah-button.mynah-button-secondary.mynah-button-border.fill-state-always.mynah-ui-clickable-item')
        )
        await saveButton.click()
    } catch (e) {
        console.error('Error saving the MCP server configuration:', e)
    }
}

/**
 * Clicks the refresh button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if refresh button was found and clicked, false otherwise
 */
export async function clickMCPRefreshButton(webviewView: WebviewView): Promise<void> {
    try {
        // First dismiss any overlay that might be present
        await dismissOverlayIfPresent(webviewView)

        await clickButton(
            webviewView,
            '.mynah-sheet-header-actions-container',
            'i.mynah-ui-icon-refresh',
            'MCP refresh button'
        )

        // Dismiss any overlay that might appear after clicking
        await dismissOverlayIfPresent(webviewView)
    } catch (e) {
        console.error('Error clicking the MCP refresh button:', e)
        throw e
    }
}

/**
 * Clicks the close/cancel button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if close button was found and clicked, false otherwise
 */
export async function clickMCPCloseButton(webviewView: WebviewView): Promise<void> {
    try {
        await dismissOverlayIfPresent(webviewView)
        await clickButton(webviewView, '.mynah-sheet-header', 'i.mynah-ui-icon-cancel', 'MCP close button')
    } catch (e) {
        console.error('Error closing the MCP overlay:', e)
        throw e
    }
}
