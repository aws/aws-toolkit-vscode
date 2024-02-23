// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.vfs.VirtualFile
import icons.AwsIcons.Resources.S3_BUCKET
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.Mockito.mock
import software.aws.toolkits.jetbrains.services.s3.editor.S3FileIconProvider
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket

class S3FileIconProviderTest {
    @Test
    fun s3IconProvider() {
        val provider = S3FileIconProvider()
        assertThat(provider.getIcon(mock(S3VirtualBucket::class.java), 0, null)).isEqualTo(S3_BUCKET)
        assertThat(provider.getIcon(mock(VirtualFile::class.java), 0, null)).isNull()
    }
}
