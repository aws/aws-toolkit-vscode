// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services

import com.intellij.openapi.util.SystemInfo
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeFalse
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.nio.file.Files

class PathMapperTest {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var mapper: PathMapper

    @Test
    fun firstMatchWinsL() {
        initMapper {
            addMapping("local", "remote")
            addMapping("local2", "remote2")
            addMapping("local2", "remote2/sub/")
        }

        createLocalFile("local2/foo")

        assertBidirectionalMapping("local2/foo", "remote2/foo")
    }

    @Test
    fun onlyPrefixIsReplaced() {
        initMapper {
            addMapping("local/sub", "remote/sub/sub")
        }

        assertBidirectionalMapping("local/sub/foo", "remote/sub/sub/foo")
    }

    @Test
    fun matchesAtFolderBoundary() {
        initMapper {
            addMapping("local", "remote")
            addMapping("local-folder", "remote2")
        }

        assertBidirectionalMapping("local-folder/foo", "remote2/foo")
    }

    @Test
    fun fileMustExistLocally() {
        initMapper {
            addMapping("local1", "remote")
            addMapping("local2", "remote")
        }

        createLocalFile("local2/foo")

        assertThat(convertToLocal("remote/foo")).isEqualTo("local2/foo")
    }

    @Test
    fun trailingSlashIsIgnored() {
        initMapper {
            addMapping("local/", "remote/")
            addMapping("local2", "remote2")
        }

        assertBidirectionalMapping("local/foo", "remote/foo")
        assertBidirectionalMapping("local2/foo", "remote2/foo")
    }

    @Test
    fun directoriesAreCaseInsensitiveOnWindows() {
        assumeTrue(SystemInfo.isWindows)

        initMapper {
            addMapping("LOCAL/", "remote/")
            addMapping("LOCAL2/Folder/", "remote2/Folder/")
        }

        assertBidirectionalMapping("local/Foo", "remote/Foo")
        assertThat(mapper.convertToRemote(createLocalFile("LOCAL/Foo"))).isEqualTo("remote/Foo")
        assertBidirectionalMapping("local2/folder/Bar", "remote2/Folder/Bar")
        assertThat(mapper.convertToRemote(createLocalFile("LOCAL2/Folder/Bar"))).isEqualTo("remote2/Folder/Bar")
    }

    @Test
    fun unmappedDirectoriesAreCaseSensitiveOnWindows() {
        assumeTrue(SystemInfo.isWindows)

        initMapper {
            addMapping("LOCAL/", "remote/")
        }

        assertBidirectionalMapping("local/tHiSiSaLeGiTiMaTePaThNaMe/FiLe.ExT", "remote/tHiSiSaLeGiTiMaTePaThNaMe/FiLe.ExT")
        assertThat(mapper.convertToRemote(createLocalFile("LOCAL/tHiSiSaLeGiTiMaTePaThNaMe/FiLe.ExT"))).isEqualTo("remote/tHiSiSaLeGiTiMaTePaThNaMe/FiLe.ExT")
    }

    @Test
    fun pathsAreCaseSensitiveWhenNotOnWindows() {
        assumeFalse(SystemInfo.isWindows)

        initMapper {
            addMapping("LOCAL/", "remote/")
        }

        assertBidirectionalMapping("LOCAL/foo", "remote/foo")
        assertThat(mapper.convertToRemote(createLocalFile("local/foo"))).isNull()
    }

    @Test
    fun unknownPathsReturnNull() {
        initMapper {
        }

        assertThat(mapper.convertToRemote(createLocalFile("foo"))).isNull()
        assertThat(convertToLocal("foo")).isNull()
    }

    @Test
    fun canonicalizeInput() {
        initMapper {
            addMapping("local/./", "remote/")
            addMapping("local2/../local3/", "remote2")
        }

        assertBidirectionalMapping("local/foo", "remote/foo")
        assertBidirectionalMapping("local3/foo", "remote2/foo")
    }

    @Test
    fun convertsLocalFilePathToLocalDirectory() {
        createLocalFile("local/foo")

        initMapper {
            addMapping("local/foo", "remote/")
        }

        assertBidirectionalMapping("local/foo", "remote/foo")
    }

    private fun assertBidirectionalMapping(local: String, remote: String) {
        assertThat(mapper.convertToRemote(createLocalFile(local))).isEqualTo(remote)
        assertThat(convertToLocal(remote)).isEqualTo(local)
    }

    private fun convertToLocal(remote: String) = mapper.convertToLocal(remote)
        ?.removePrefix(PathMapper.normalizeLocal(tempFolder.root.absolutePath))
        ?.removePrefix("/")

    private fun createLocalFile(path: String): String {
        val file = tempFolder.root.toPath().resolve(path)
        Files.createDirectories(file.parent)
        if (!Files.exists(file)) {
            Files.createFile(file)
        }

        return file.toString()
    }

    private fun initMapper(init: MutableList<PathMapping>.() -> Unit) {
        val mappings = mutableListOf<PathMapping>()
        mappings.init()
        mapper = PathMapper(mappings)
    }

    private fun MutableList<PathMapping>.addMapping(local: String, remote: String) {
        val file = tempFolder.root.toPath().resolve(local)
        Files.createDirectories(file.parent)
        this.add(PathMapping(file.toString(), remote))
    }
}
