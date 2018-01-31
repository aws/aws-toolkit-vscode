package software.aws.toolkits.jetbrains.ui.s3;


import com.amazonaws.intellij.utils.DateUtils;
import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.model.CopyObjectRequest;
import com.amazonaws.services.s3.model.GetObjectTaggingRequest;
import com.amazonaws.services.s3.model.GetObjectTaggingResult;
import com.amazonaws.services.s3.model.ObjectMetadata;
import com.amazonaws.services.s3.model.ObjectTagging;
import com.amazonaws.services.s3.model.SetObjectTaggingRequest;
import com.amazonaws.services.s3.model.Tag;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.JBLabel;
import com.intellij.ui.components.JBTabbedPane;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.TextTransferable;
import java.awt.Insets;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTabbedPane;
import javax.swing.SwingConstants;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.aws.s3.S3VirtualFile;
import software.aws.toolkits.jetbrains.ui.KeyValue;
import software.aws.toolkits.jetbrains.ui.KeyValueTableEditor;
import software.aws.toolkits.jetbrains.ui.MessageUtils;

public class ObjectDetailsPanel {
    private final S3VirtualFile s3File;
    private JPanel contentPanel;
    private JBLabel objectNameLabel;
    private JBLabel size;
    private JBLabel modifiedDate;
    private JButton copyArnButton;
    private JButton applyButton;
    private JButton cancelButton;
    private JTabbedPane tabbedPanel;
    private KeyValueTableEditor tags;
    private KeyValueTableEditor metadata;
    private JBLabel eTag;

    public ObjectDetailsPanel(S3VirtualFile s3File) {
        this.s3File = s3File;

        this.contentPanel.setBorder(IdeBorderFactory.createTitledBorder("Object Details", false));

        this.objectNameLabel.setText(s3File.getName());

        this.size.setText(StringUtil.formatFileSize(s3File.getLength()));
        this.modifiedDate.setText(DateUtils.formatDate(s3File.getTimeStamp()));
        this.eTag.setText(s3File.getETag());

        this.copyArnButton.addActionListener(e -> {
            String arn = "arn:aws:s3:::" + s3File.getPath();
            CopyPasteManager.getInstance().setContents(new TextTransferable(arn));
        });

        this.applyButton.addActionListener(actionEvent -> applyChanges());
        this.cancelButton.addActionListener(actionEvent -> cancelChanges());

        this.tags.refresh();
        this.metadata.refresh();
    }

    private void createUIComponents() {
        tags = new KeyValueTableEditor(this::loadTags, null, null, this::onValueChanged);
        metadata = new KeyValueTableEditor(this::loadMetadata, null, null, this::onValueChanged);

        tabbedPanel = new JBTabbedPane(SwingConstants.TOP) {
            @NotNull
            @Override
            protected Insets getInsetsForTabComponent() {
                return JBUI.emptyInsets();
            }
        };
    }

    private List<KeyValue> loadTags() {
        AmazonS3 s3Client = s3File.getFileSystem().getS3Client();
        GetObjectTaggingRequest taggingRequest = new GetObjectTaggingRequest(s3File.getBucketName(), s3File.getKey());
        GetObjectTaggingResult objectTags = s3Client.getObjectTagging(taggingRequest);
        if (objectTags == null) {
            return Collections.emptyList();
        }

        return objectTags.getTagSet()
                         .stream()
                         .map(entry -> new KeyValue(entry.getKey(), entry.getValue()))
                         .collect(Collectors.toList());
    }

    private void updateTags(List<KeyValue> newTags) {
        List<Tag> tags = newTags.stream()
                                .map(keyValue -> new Tag(keyValue.getKey(), keyValue.getValue()))
                                .collect(Collectors.toList());

        AmazonS3 s3Client = s3File.getFileSystem().getS3Client();
        s3Client.setObjectTagging(new SetObjectTaggingRequest(s3File.getBucketName(), s3File.getKey(), new ObjectTagging(tags)));
    }

    private List<KeyValue> loadMetadata() {
        AmazonS3 s3Client = s3File.getFileSystem().getS3Client();
        ObjectMetadata objectMetadata = s3Client.getObjectMetadata(s3File.getBucketName(), s3File.getKey());
        return objectMetadata.getUserMetadata()
                             .entrySet()
                             .stream()
                             .map(entry -> new KeyValue(entry.getKey(), entry.getValue()))
                             .collect(Collectors.toList());
    }

    private void onValueChanged() {
        if (tags.isModified() || metadata.isModified()) {
            applyButton.setEnabled(true);
            cancelButton.setEnabled(true);
        } else {
            applyButton.setEnabled(false);
            cancelButton.setEnabled(false);
        }
    }

    private void applyChanges() {
        metadata.setBusy(true);
        tags.setBusy(true);
        applyButton.setEnabled(false);
        cancelButton.setEnabled(false);

        // To update metadata, we need to issue a copy
        if (metadata.isModified()) {
            CopyObjectRequest copyObjectRequest = new CopyObjectRequest(s3File.getBucketName(), s3File.getKey(),
                                                                        s3File.getBucketName(), s3File.getKey());
            ObjectMetadata newObjectMetadata = new ObjectMetadata();
            metadata.getItems().forEach(keyValue -> newObjectMetadata.addUserMetadata(keyValue.getKey(), keyValue.getValue()));
            copyObjectRequest.setNewObjectMetadata(newObjectMetadata);

            if (tags.isModified()) {
                copyObjectRequest.setNewObjectTagging(getObjectTagging());
            }

            ApplicationManager.getApplication().executeOnPooledThread(() -> {
                s3File.getFileSystem().getS3Client().copyObject(copyObjectRequest);
                metadata.refresh();
                tags.refresh();
            });
        } else {
            ApplicationManager.getApplication().executeOnPooledThread(() -> {
                SetObjectTaggingRequest setObjectTaggingRequest = new SetObjectTaggingRequest(s3File.getBucketName(),
                                                                                              s3File.getKey(),
                                                                                              getObjectTagging());
                s3File.getFileSystem().getS3Client().setObjectTagging(setObjectTaggingRequest);
                tags.refresh();
            });
        }
    }

    private ObjectTagging getObjectTagging() {
        return new ObjectTagging(tags.getItems()
                                     .stream()
                                     .map(keyValue -> new Tag(keyValue.getKey(), keyValue.getValue()))
                                     .collect(Collectors.toList()));
    }

    private void cancelChanges() {
        if (!MessageUtils.verifyLossOfChanges(contentPanel)) {
            return;
        }

        if (tags.isModified()) {
            tags.reset();
        }

        if (metadata.isModified()) {
            metadata.reset();
        }
    }

    public JComponent getComponent() {
        return contentPanel;
    }
}
