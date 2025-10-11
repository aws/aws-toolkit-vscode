/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the state of edit suggestions to avoid circular dependencies
 */
export class EditSuggestionState {
    private static isEditSuggestionCurrentlyActive = false
    private static displayStartTime = Date.now()

    static setEditSuggestionActive(active: boolean): void {
        this.isEditSuggestionCurrentlyActive = active
        if (active) {
            this.displayStartTime = Date.now()
        }
    }

    static isEditSuggestionActive(): boolean {
        return this.isEditSuggestionCurrentlyActive
    }

    static isEditSuggestionDisplayingOverOneSecond(): boolean {
        return this.isEditSuggestionActive() && Date.now() - this.displayStartTime > 1000
    }
}
