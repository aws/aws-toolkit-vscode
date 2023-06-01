// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.envclient.models

import com.fasterxml.jackson.annotation.JsonEnumDefaultValue
import com.fasterxml.jackson.annotation.JsonValue

/**
 * Status object construct.
 * @param actionId
 * @param status
 * @param message
 */
data class GetStatusResponse(
    val actionId: String? = null,
    val status: Status? = null,
    val message: String? = null,
    val location: String? = null
) {
    /**
     * Values: PENDING,STABLE,CHANGED,IMAGES-UPDATE-AVAILABLE
     */
    enum class Status(@JsonValue val value: kotlin.String) {
        PENDING("PENDING"),
        STABLE("STABLE"),
        CHANGED("CHANGED"),
        IMAGES_UPDATE_AVAILABLE("IMAGES-UPDATE-AVAILABLE"),

        @JsonEnumDefaultValue
        UNKNOWN("UNKNOWN")
    }
}
