// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils.test

import org.assertj.core.api.AbstractIterableAssert
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.ListAssert
import org.assertj.core.api.ObjectAssert
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions

@Suppress("UNCHECKED_CAST")
val <T : Any> ObjectAssert<T?>.notNull: ObjectAssert<T>
    get() = this.isNotNull as ObjectAssert<T>

@Suppress("UNCHECKED_CAST")
inline fun <reified SubType : Any> AbstractIterableAssert<*, *, *, *>.hasOnlyElementsOfTypeKt() =
    hasOnlyElementsOfType(SubType::class.java) as AbstractIterableAssert<*, Iterable<SubType>, SubType, *>

@Suppress("UNCHECKED_CAST")
inline fun <reified SubType : Any> ListAssert<*>.hasOnlyOneElementOfType(): ObjectAssert<SubType> =
    (hasOnlyElementsOfType(SubType::class.java) as ListAssert<SubType>).singleElement()

fun assertPosixPermissions(path: Path, expected: String) {
    val perms = PosixFilePermissions.toString(Files.getPosixFilePermissions(path))
    assertThat(perms).isEqualTo(expected)
}
