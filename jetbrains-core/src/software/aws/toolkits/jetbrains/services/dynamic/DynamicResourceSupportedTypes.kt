// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service

class DynamicResourceSupportedTypes {
    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    private val supportedTypes = if (ApplicationManager.getApplication().isDispatchThread) {
        throw IllegalStateException("Access from Event Dispatch Thread")
    } else {
        this.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
            mapper.readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(PermittedOperation.LIST) }.map { it.key }
        } ?: throw RuntimeException("dynamic resource manifest not found")
    }
    fun getSupportedTypes(): List<String> = supportedTypes

    companion object {
        fun getInstance(): DynamicResourceSupportedTypes = service()
    }
}
