// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.profiles.Profile
import software.aws.toolkits.resources.message
import java.util.concurrent.ConcurrentHashMap

class ProfileHolder {
    private val profiles = ConcurrentHashMap<String, Profile>()

    fun getProfileOrNull(profileName: String) = profiles.get(profileName)

    fun getProfile(profileName: String) = getProfileOrNull(profileName)
        ?: throw IllegalArgumentException(message("credentials.profile.not_found", profileName))

    fun putProfile(profile: Profile) = profiles.put(profile.name(), profile)

    fun removeProfile(profileName: String) = profiles.remove(profileName)

    fun list() = profiles.values
}
