import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
} from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import fitterService, { isFittingCompleted } from "../../services/fitter.service";

/* -----------------------------------------
   Responsive scaling helpers
   Base width = a standard 390px phone (iPhone 13/14 class).
   Ratio is clamped so things don't blow up on tablets or
   shrink too much on small phones.
----------------------------------------- */

const BASE_WIDTH = 390;

function makeScaler(width) {
  const rawRatio = width / BASE_WIDTH;
  const ratio = Math.min(Math.max(rawRatio, 0.85), 1.3);

  // Full scale — use for things that should grow/shrink with the screen.
  const scale = (size) => size * ratio;

  // Moderate scale — use for font sizes / spacing so they don't grow
  // as aggressively as raw width (keeps tablets from having giant text).
  const moderateScale = (size, factor = 0.4) =>
    size + (scale(size) - size) * factor;

  return { scale, moderateScale };
}

export default function FittingDetail() {
  const { id } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= 700;
  const isNarrow = width < 340;

  const styles = useMemo(
    () => createStyles(width, height, insets, isTablet),
    [width, height, insets, isTablet]
  );

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [comment, setComment] = useState("");

  const [proofImage, setProofImage] = useState(null);

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError("");

      if (!id) {
        throw new Error("Fitting ticket ID is missing.");
      }

      const [ticketData, userData] =
        await Promise.all([
          fitterService.getTaskById(id),
          AsyncStorage.getItem("userData"),
        ]);

      setTicket(ticketData);

      if (userData) {
        setCurrentUser(JSON.parse(userData));
      }
    } catch (err) {
      console.error(
        "[FittingDetail] Load error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load fitting details."
      );
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTicket();
    }, [id])
  );

  // --------------------------------------------------
  // Take photo
  // --------------------------------------------------

  const takePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera Permission",
          "Camera permission is required to take fitting proof."
        );
        return;
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.8,
        });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        return;
      }

      setProofImage({
        uri: asset.uri,
        fileName:
          asset.fileName ||
          `fitting-proof-${Date.now()}.jpg`,
        mimeType:
          asset.mimeType ||
          "image/jpeg",
      });
    } catch (err) {
      console.error(
        "[FittingDetail] Camera error:",
        err
      );

      Alert.alert(
        "Camera Error",
        "Unable to take photo."
      );
    }
  };

  // --------------------------------------------------
  // Choose from gallery
  // --------------------------------------------------

  const choosePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Gallery Permission",
          "Gallery permission is required to select fitting proof."
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.8,
        });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        return;
      }

      setProofImage({
        uri: asset.uri,
        fileName:
          asset.fileName ||
          `fitting-proof-${Date.now()}.jpg`,
        mimeType:
          asset.mimeType ||
          "image/jpeg",
      });
    } catch (err) {
      console.error(
        "[FittingDetail] Gallery error:",
        err
      );

      Alert.alert(
        "Gallery Error",
        "Unable to select photo."
      );
    }
  };

  // --------------------------------------------------
  // Send OTP
  // --------------------------------------------------

  const sendOtp = async () => {
    const mobile = ticket?.customerMobile;

    if (!mobile) {
      Alert.alert(
        "Customer Mobile Missing",
        "Customer mobile number is not available."
      );
      return;
    }

    try {
      setSendingOtp(true);

      await fitterService.sendCustomerOtp(
        mobile
      );

      setOtpSent(true);
      setOtpVerified(false);

      Alert.alert(
        "OTP Sent",
        "Customer OTP has been sent successfully."
      );
    } catch (err) {
      console.error(
        "[FittingDetail] OTP send error:",
        err
      );

      Alert.alert(
        "OTP Error",
        err?.message ||
          "Unable to send customer OTP."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  // --------------------------------------------------
  // Verify OTP
  // --------------------------------------------------

  const verifyOtp = async () => {
    const mobile = ticket?.customerMobile;

    if (!mobile) {
      Alert.alert(
        "Customer Mobile Missing",
        "Customer mobile number is not available."
      );
      return;
    }

    if (!otp.trim()) {
      Alert.alert(
        "OTP Required",
        "Please enter the customer OTP."
      );
      return;
    }

    try {
      setVerifyingOtp(true);

      await fitterService.verifyCustomerOtp(
        mobile,
        otp.trim()
      );

      setOtpVerified(true);

      Alert.alert(
        "OTP Verified",
        "Customer OTP verified successfully."
      );
    } catch (err) {
      console.error(
        "[FittingDetail] OTP verification error:",
        err
      );

      setOtpVerified(false);

      Alert.alert(
        "Invalid OTP",
        err?.message ||
          "Customer OTP verification failed."
      );
    } finally {
      setVerifyingOtp(false);
    }
  };

  // --------------------------------------------------
  // Start fitting
  // --------------------------------------------------

  const startFitting = async () => {
    if (!ticket?._id) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await fitterService.updateStatus(
          ticket._id,
          "FITTING_IN_PROGRESS"
        );

      if (response?.data) {
        setTicket(response.data);
      } else {
        await loadTicket();
      }

      Alert.alert(
        "Fitting Started",
        "Fitting has been marked as in progress."
      );
    } catch (err) {
      console.error(
        "[FittingDetail] Start fitting error:",
        err
      );

      Alert.alert(
        "Update Failed",
        err?.message ||
          "Unable to update fitting status."
      );
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // Complete fitting
  // --------------------------------------------------

  const completeFitting = async () => {
    if (!ticket?._id) {
      return;
    }

    if (!proofImage?.uri) {
      Alert.alert(
        "Proof Required",
        "Please take or select at least one fitting proof photo."
      );
      return;
    }

    if (!otpVerified) {
      Alert.alert(
        "OTP Required",
        "Please verify the customer OTP before completing the fitting."
      );
      return;
    }

    try {
      setSaving(true);

      const user =
        currentUser || {};

      const fitterId =
        user.id || user._id;

      if (!fitterId) {
        throw new Error(
          "Fitter ID is missing. Please login again."
        );
      }

      const fitterName =
        user.name ||
        user.fullName ||
        user.employeeName ||
        "Fitter";

      const formData = new FormData();

      formData.append(
        "status",
        "FITTING_DONE"
      );

      formData.append(
        "isFittingDone",
        "true"
      );

      formData.append(
        "isFitting",
        "true"
      );

      formData.append(
        "performedBy",
        "FITTER"
      );

      formData.append(
        "performedById",
        String(fitterId)
      );

      formData.append(
        "commentedBy",
        "FITTER"
      );

      formData.append(
        "commentedById",
        String(fitterId)
      );

      formData.append(
        "message",
        comment.trim() ||
          "Fitting completed successfully."
      );

      formData.append(
        "comment",
        comment.trim() ||
          "Fitting completed successfully."
      );

      formData.append(
        "attachments",
        {
          uri: proofImage.uri,
          name:
            proofImage.fileName ||
            `fitting-proof-${Date.now()}.jpg`,
          type:
            proofImage.mimeType ||
            "image/jpeg",
        }
      );

      await fitterService.completeFitting(
        ticket._id,
        formData
      );

      Alert.alert(
        "Fitting Completed",
        "Fitting has been completed successfully.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace(
                "/(fitter)/completed-fittings"
              );
            },
          },
        ]
      );
    } catch (err) {
      console.error(
        "[FittingDetail] Complete fitting error:",
        err
      );

      Alert.alert(
        "Completion Failed",
        err?.message ||
          "Unable to complete fitting."
      );
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // Loading
  // --------------------------------------------------

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D86A16"
        />

        <Text style={styles.loadingText}>
          Loading fitting details...
        </Text>
      </View>
    );
  }

  // --------------------------------------------------
  // Error
  // --------------------------------------------------

  if (error || !ticket) {
    return (
      <View style={styles.center}>
        <MaterialIcons
          name="error-outline"
          size={52}
          color="#C62828"
        />

        <Text style={styles.errorTitle}>
          Unable to load fitting
        </Text>

        <Text style={styles.errorText}>
          {error || "Fitting not found."}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadTicket}
        >
          <Text style={styles.retryText}>
            Retry
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButtonSimple}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const customer =
    ticket.customer || "Customer";

  const ticketNumber =
    ticket.ticketNumber ||
    ticket._id;

  const productName =
    ticket.productDetails?.productName ||
    "Product not available";

  const productCode =
    ticket.productDetails?.productCode ||
    "N/A";

  const orderId =
    ticket.productDetails?.orderId ||
    "N/A";

  const mobile =
    ticket.customerMobile ||
    "Not available";

  const status =
    ticket.status || "UNKNOWN";

  const address = [
    ticket.serviceAddress?.line1,
    ticket.serviceAddress?.line2,
    ticket.serviceAddress?.city,
    ticket.serviceAddress?.state,
    ticket.serviceAddress?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const fittingDate =
    formatDate(
      ticket.fitting?.scheduledDate
    );

  const timeSlot =
    ticket.fitting?.scheduledTimeSlot ||
    "Not scheduled";

  const isCompleted = isFittingCompleted(ticket);

  const isInProgress =
    status === "FITTING_IN_PROGRESS";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Fitting Details
          </Text>

          <Text style={styles.headerTicket} numberOfLines={1}>
            {ticketNumber}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status */}
        <View style={styles.statusCard}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.statusLabel}>
              CURRENT STATUS
            </Text>

            <Text style={styles.statusValue}>
              {formatStatus(status)}
            </Text>
          </View>

          <View
            style={[
              styles.statusIcon,
              isCompleted &&
                styles.statusIconCompleted,
            ]}
          >
            <MaterialIcons
              name={
                isCompleted
                  ? "check-circle"
                  : isInProgress
                  ? "build"
                  : "assignment"
              }
              size={28}
              color={
                isCompleted
                  ? "#087A4A"
                  : "#D86A16"
              }
            />
          </View>
        </View>

        {/* Customer */}
        <SectionTitle
          icon="person"
          title="Customer Details"
          styles={styles}
        />

        <View style={styles.card}>
          <Text style={styles.customerName}>
            {customer}
          </Text>

          <InfoRow
            icon="phone"
            label="Mobile"
            value={mobile}
            styles={styles}
          />

          <InfoRow
            icon="location-on"
            label="Address"
            value={
              address ||
              "Address not available"
            }
            styles={styles}
          />
        </View>

        {/* Product */}
        <SectionTitle
          icon="inventory-2"
          title="Product Details"
          styles={styles}
        />

        <View style={styles.card}>
          <InfoRow
            icon="inventory-2"
            label="Product"
            value={productName}
            styles={styles}
          />

          <InfoRow
            icon="qr-code"
            label="Product Code"
            value={productCode}
            styles={styles}
          />

          <InfoRow
            icon="receipt-long"
            label="Order ID"
            value={orderId}
            styles={styles}
          />

          {ticket.productDetails
            ?.invoiceNumber ? (
            <InfoRow
              icon="description"
              label="Invoice"
              value={
                ticket.productDetails
                  .invoiceNumber
              }
              styles={styles}
            />
          ) : null}
        </View>

        {/* Fitting Schedule */}
        <SectionTitle
          icon="event"
          title="Fitting Schedule"
          styles={styles}
        />

        <View
          style={[
            styles.scheduleCard,
            isNarrow && styles.scheduleCardStacked,
          ]}
        >
          <View
            style={[
              styles.scheduleItem,
              isNarrow && styles.scheduleItemStacked,
            ]}
          >
            <MaterialIcons
              name="calendar-today"
              size={22}
              color="#D86A16"
            />

            <View style={styles.scheduleText}>
              <Text style={styles.scheduleLabel}>
                Date
              </Text>

              <Text style={styles.scheduleValue}>
                {fittingDate}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.scheduleItem,
              isNarrow && styles.scheduleItemStacked,
            ]}
          >
            <MaterialIcons
              name="schedule"
              size={23}
              color="#D86A16"
            />

            <View style={styles.scheduleText}>
              <Text style={styles.scheduleLabel}>
                Time Slot
              </Text>

              <Text style={styles.scheduleValue}>
                {timeSlot}
              </Text>
            </View>
          </View>
        </View>

        {/* Start fitting */}
        {!isCompleted &&
        !isInProgress ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={startFitting}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <MaterialIcons
                  name="build"
                  size={21}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Start Fitting
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* In progress message */}
        {isInProgress &&
        !isCompleted ? (
          <View style={styles.progressBox}>
            <MaterialIcons
              name="build"
              size={25}
              color="#D86A16"
            />

            <View style={styles.progressContent}>
              <Text style={styles.progressTitle}>
                Fitting In Progress
              </Text>

              <Text style={styles.progressText}>
                Complete the fitting and verify
                customer OTP before marking it
                done.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Proof */}
        {!isCompleted ? (
          <>
            <SectionTitle
              icon="photo-camera"
              title="Fitting Proof"
              styles={styles}
            />

            <View style={styles.card}>
              {!proofImage ? (
                <View style={styles.photoEmpty}>
                  <MaterialIcons
                    name="add-a-photo"
                    size={45}
                    color="#A9B8B1"
                  />

                  <Text
                    style={styles.photoEmptyTitle}
                  >
                    Add Fitting Proof
                  </Text>

                  <Text
                    style={styles.photoEmptyText}
                  >
                    Take a photo or select one
                    from your gallery.
                  </Text>
                </View>
              ) : (
                <View style={styles.photoPreview}>
                  <Image
                    source={{
                      uri: proofImage.uri,
                    }}
                    style={styles.proofImage}
                  />

                  <TouchableOpacity
                    style={styles.removePhoto}
                    onPress={() =>
                      setProofImage(null)
                    }
                  >
                    <MaterialIcons
                      name="close"
                      size={20}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                </View>
              )}

              <View
                style={[
                  styles.photoButtons,
                  isNarrow && styles.photoButtonsStacked,
                ]}
              >
                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={takePhoto}
                >
                  <MaterialIcons
                    name="camera-alt"
                    size={21}
                    color="#D86A16"
                  />

                  <Text
                    style={styles.photoButtonText}
                  >
                    Take Photo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={choosePhoto}
                >
                  <MaterialIcons
                    name="photo-library"
                    size={21}
                    color="#D86A16"
                  />

                  <Text
                    style={styles.photoButtonText}
                  >
                    Gallery
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}

        {/* Customer OTP */}
        {!isCompleted ? (
          <>
            <SectionTitle
              icon="verified-user"
              title="Customer Verification"
              styles={styles}
            />

            <View style={styles.card}>
              <Text style={styles.otpDescription}>
                Send an OTP to the customer and
                verify it before completing the
                fitting.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={sendOtp}
                disabled={sendingOtp}
              >
                {sendingOtp ? (
                  <ActivityIndicator
                    color="#D86A16"
                  />
                ) : (
                  <>
                    <MaterialIcons
                      name="sms"
                      size={21}
                      color="#D86A16"
                    />

                    <Text
                      style={
                        styles.secondaryButtonText
                      }
                    >
                      {otpSent
                        ? "Resend OTP"
                        : "Send Customer OTP"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {otpSent ? (
                <View
                  style={[
                    styles.otpArea,
                    isNarrow && styles.otpAreaStacked,
                  ]}
                >
                  <TextInput
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="Enter customer OTP"
                    placeholderTextColor="#9AA6A1"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[
                      styles.otpInput,
                      otpVerified &&
                        styles.otpInputVerified,
                    ]}
                  />

                  <TouchableOpacity
                    style={[
                      styles.verifyButton,
                      otpVerified &&
                        styles.verifiedButton,
                    ]}
                    onPress={verifyOtp}
                    disabled={
                      verifyingOtp ||
                      otpVerified
                    }
                  >
                    {verifyingOtp ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                      />
                    ) : (
                      <>
                        <MaterialIcons
                          name={
                            otpVerified
                              ? "check"
                              : "verified"
                          }
                          size={20}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.verifyButtonText
                          }
                        >
                          {otpVerified
                            ? "Verified"
                            : "Verify OTP"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              {otpVerified ? (
                <View
                  style={styles.verifiedBox}
                >
                  <MaterialIcons
                    name="check-circle"
                    size={21}
                    color="#087A4A"
                  />

                  <Text
                    style={styles.verifiedText}
                  >
                    Customer OTP verified
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Comment */}
        {!isCompleted ? (
          <>
            <SectionTitle
              icon="comment"
              title="Completion Comment"
              styles={styles}
            />

            <View style={styles.card}>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Add a fitting completion comment..."
                placeholderTextColor="#9AA6A1"
                multiline
                textAlignVertical="top"
                style={styles.commentInput}
              />
            </View>
          </>
        ) : null}

        {/* Complete */}
        {!isCompleted ? (
          <TouchableOpacity
            style={[
              styles.completeButton,
              (!proofImage ||
                !otpVerified ||
                saving) &&
                styles.completeButtonDisabled,
            ]}
            onPress={completeFitting}
            disabled={
              !proofImage ||
              !otpVerified ||
              saving
            }
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <MaterialIcons
                  name="check-circle"
                  size={23}
                  color="#FFFFFF"
                />

                <Text
                  style={styles.completeButtonText}
                >
                  Complete Fitting
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBanner}>
            <MaterialIcons
              name="check-circle"
              size={27}
              color="#087A4A"
            />

            <View style={styles.completedBannerText}>
              <Text
                style={styles.completedBannerTitle}
              >
                Fitting Completed
              </Text>

              <Text
                style={styles.completedBannerSubtitle}
              >
                This fitting job has already been
                completed.
              </Text>
            </View>
          </View>
        )}

        {/* Existing comments/activity */}
        {Array.isArray(ticket.comments) &&
        ticket.comments.length > 0 ? (
          <>
            <SectionTitle
              icon="history"
              title="Activity"
              styles={styles}
            />

            <View style={styles.card}>
              {ticket.comments
                .slice()
                .reverse()
                .map((item, index) => (
                  <View
                    key={
                      item._id ||
                      `${index}`
                    }
                    style={[
                      styles.commentItem,
                      index <
                        ticket.comments
                          .length -
                          1 &&
                        styles.commentBorder,
                    ]}
                  >
                    <View
                      style={
                        styles.commentHeader
                      }
                    >
                      <Text
                        style={
                          styles.commentBy
                        }
                        numberOfLines={1}
                      >
                        {item.commentedBy ||
                          "User"}
                      </Text>

                      <Text
                        style={
                          styles.commentDate
                        }
                        numberOfLines={1}
                      >
                        {formatDateTime(
                          item.createdAt
                        )}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.commentStatus
                      }
                    >
                      {item.status
                        ? formatStatus(
                            item.status
                          )
                        : ""}
                    </Text>

                    <Text
                      style={
                        styles.commentMessage
                      }
                    >
                      {item.comment ||
                        item.message ||
                        "No comment"}
                    </Text>

                    {item.attachmentUrl ? (
                      <Text
                        style={
                          styles.attachmentText
                        }
                      >
                        📎 Attachment available
                      </Text>
                    ) : null}
                  </View>
                ))}
            </View>
          </>
        ) : null}

        <View style={{ height: 35 }} />
      </ScrollView>
    </View>
  );
}

/* -----------------------------------------
   Section Title
----------------------------------------- */

function SectionTitle({
  icon,
  title,
  styles,
}) {
  return (
    <View style={styles.sectionTitle}>
      <MaterialIcons
        name={icon}
        size={20}
        color="#D86A16"
      />

      <Text style={styles.sectionTitleText}>
        {title}
      </Text>
    </View>
  );
}

/* -----------------------------------------
   Info Row
----------------------------------------- */

function InfoRow({
  icon,
  label,
  value,
  styles,
}) {
  return (
    <View style={styles.infoRow}>
      <MaterialIcons
        name={icon}
        size={19}
        color="#71807A"
      />

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text style={styles.infoValue}>
          {value || "Not available"}
        </Text>
      </View>
    </View>
  );
}

/* -----------------------------------------
   Helpers
----------------------------------------- */

function formatDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatStatus(status) {
  if (!status) {
    return "UNKNOWN";
  }

  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

/* -----------------------------------------
   Styles (responsive)
   Regenerated whenever window width/height or
   safe-area insets change (rotation, split-screen,
   foldables, tablets, etc).
----------------------------------------- */

function createStyles(width, height, insets, isTablet) {
  const { scale, moderateScale } = makeScaler(width);

  // Cap how wide the readable content gets on tablets/large screens,
  // and center it instead of letting text stretch edge-to-edge.
  const CONTENT_MAX_WIDTH = 640;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  const horizontalPadding = isTablet
    ? Math.max(16, (width - contentWidth) / 2 + 16)
    : 16;

  const proofImageHeight = Math.min(
    Math.max(width * 0.55, 160),
    320
  );

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#F3EEE8",
    },

    center: {
      flex: 1,
      backgroundColor: "#F3EEE8",
      alignItems: "center",
      justifyContent: "center",
      padding: 25,
      paddingTop: insets.top + 25,
      paddingBottom: insets.bottom + 25,
    },

    loadingText: {
      marginTop: 12,
      color: "#68756F",
      fontSize: moderateScale(15),
    },

    errorTitle: {
      marginTop: 14,
      fontSize: moderateScale(19),
      fontWeight: "800",
      color: "#26332E",
      textAlign: "center",
    },

    errorText: {
      marginTop: 7,
      textAlign: "center",
      fontSize: moderateScale(14),
      lineHeight: moderateScale(20),
      color: "#7A8782",
    },

    retryButton: {
      marginTop: 20,
      paddingHorizontal: 25,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: "#D86A16",
    },

    retryText: {
      color: "#FFFFFF",
      fontSize: moderateScale(14),
      fontWeight: "800",
    },

    backButtonSimple: {
      marginTop: 15,
      padding: 10,
    },

    backText: {
      color: "#D86A16",
      fontWeight: "700",
    },

    header: {
      backgroundColor: "#0F2D52",
      height: 160,
      paddingTop: 50,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
    },

    backButton: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },

    headerContent: {
      marginLeft: 14,
      flexShrink: 1,
    },

    headerTitle: {
      fontSize: moderateScale(20),
      fontWeight: "bold",
      color: "#FFFFFF",
    },

    headerTicket: {
      marginTop: 2,
      fontSize: moderateScale(12),
      color: "#F5A623",
      fontWeight: "700",
    },

    content: {
      padding: horizontalPadding,
      paddingBottom: insets.bottom + 30,
      width: "100%",
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: "center",
    },

    statusCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: "#E2EAE6",
      marginBottom: 20,
    },

    statusLabel: {
      fontSize: moderateScale(10),
      fontWeight: "700",
      letterSpacing: 1,
      color: "#89958F",
    },

    statusValue: {
      marginTop: 5,
      fontSize: moderateScale(17),
      fontWeight: "800",
      color: "#26332E",
    },

    statusIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
    },

    statusIconCompleted: {
      backgroundColor: "#E8F7EF",
    },

    sectionTitle: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
      marginTop: 3,
    },

    sectionTitleText: {
      marginLeft: 8,
      fontSize: moderateScale(18),
      fontWeight: "800",
      color: "#0F2D52",
    },

    card: {
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: "#E2EAE6",
      marginBottom: 20,
    },

    customerName: {
      fontSize: moderateScale(20),
      fontWeight: "800",
      color: "#0F2D52",
      marginBottom: 7,
    },

    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 13,
    },

    infoContent: {
      flex: 1,
      marginLeft: 10,
    },

    infoLabel: {
      fontSize: moderateScale(10),
      color: "#8A9691",
      fontWeight: "700",
    },

    infoValue: {
      marginTop: 3,
      fontSize: moderateScale(14),
      color: "#35423D",
      lineHeight: moderateScale(20),
      fontWeight: "600",
    },

    scheduleCard: {
      backgroundColor: "#FFF4EC",
      borderRadius: 16,
      padding: 15,
      flexDirection: "row",
      marginBottom: 20,
    },

    scheduleCardStacked: {
      flexDirection: "column",
      gap: 14,
    },

    scheduleItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },

    scheduleItemStacked: {
      flex: undefined,
    },

    scheduleText: {
      marginLeft: 8,
      flexShrink: 1,
    },

    scheduleLabel: {
      fontSize: moderateScale(10),
      color: "#6E7C76",
      fontWeight: "600",
    },

    scheduleValue: {
      marginTop: 3,
      fontSize: moderateScale(13),
      fontWeight: "800",
      color: "#263B33",
    },

    primaryButton: {
      backgroundColor: "#D86A16",
      minHeight: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginBottom: 20,
    },

    primaryButtonText: {
      marginLeft: 8,
      color: "#FFFFFF",
      fontSize: moderateScale(15),
      fontWeight: "800",
    },

    progressBox: {
      backgroundColor: "#FFF4EC",
      borderRadius: 15,
      padding: 15,
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 20,
    },

    progressContent: {
      flex: 1,
      marginLeft: 10,
    },

    progressTitle: {
      fontSize: moderateScale(15),
      fontWeight: "800",
      color: "#263B33",
    },

    progressText: {
      marginTop: 4,
      fontSize: moderateScale(12),
      lineHeight: moderateScale(18),
      color: "#65736D",
    },

    photoEmpty: {
      alignItems: "center",
      paddingVertical: 20,
    },

    photoEmptyTitle: {
      marginTop: 10,
      fontSize: moderateScale(16),
      fontWeight: "800",
      color: "#26332E",
    },

    photoEmptyText: {
      marginTop: 5,
      textAlign: "center",
      color: "#7A8782",
      fontSize: moderateScale(12),
    },

    photoPreview: {
      position: "relative",
    },

    proofImage: {
      width: "100%",
      height: proofImageHeight,
      borderRadius: 12,
      backgroundColor: "#E9EFEC",
    },

    removePhoto: {
      position: "absolute",
      right: 10,
      top: 10,
      width: 35,
      height: 35,
      borderRadius: 18,
      backgroundColor: "#B3261E",
      alignItems: "center",
      justifyContent: "center",
    },

    photoButtons: {
      flexDirection: "row",
      marginTop: 14,
      gap: 10,
    },

    photoButtonsStacked: {
      flexDirection: "column",
    },

    photoButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#F3C9A5",
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },

    photoButtonText: {
      marginLeft: 7,
      color: "#D86A16",
      fontSize: moderateScale(13),
      fontWeight: "800",
    },

    otpDescription: {
      fontSize: moderateScale(13),
      lineHeight: moderateScale(19),
      color: "#697670",
      marginBottom: 13,
    },

    secondaryButton: {
      minHeight: 48,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#F3C9A5",
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },

    secondaryButtonText: {
      marginLeft: 7,
      color: "#D86A16",
      fontSize: moderateScale(14),
      fontWeight: "800",
    },

    otpArea: {
      marginTop: 13,
      flexDirection: "row",
      gap: 9,
    },

    otpAreaStacked: {
      flexDirection: "column",
    },

    otpInput: {
      flex: 1,
      height: 50,
      borderWidth: 1,
      borderColor: "#D7E1DD",
      borderRadius: 11,
      paddingHorizontal: 14,
      fontSize: moderateScale(17),
      fontWeight: "700",
      color: "#26332E",
      letterSpacing: 2,
    },

    otpInputVerified: {
      borderColor: "#70B99D",
      backgroundColor: "#F0FAF5",
    },

    verifyButton: {
      minWidth: 105,
      height: 50,
      borderRadius: 11,
      backgroundColor: "#D86A16",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      paddingHorizontal: 10,
    },

    verifiedButton: {
      backgroundColor: "#087A4A",
    },

    verifyButtonText: {
      marginLeft: 5,
      color: "#FFFFFF",
      fontSize: moderateScale(12),
      fontWeight: "800",
    },

    verifiedBox: {
      marginTop: 13,
      padding: 11,
      borderRadius: 10,
      backgroundColor: "#E8F7EF",
      flexDirection: "row",
      alignItems: "center",
    },

    verifiedText: {
      marginLeft: 7,
      color: "#087A4A",
      fontSize: moderateScale(13),
      fontWeight: "700",
    },

    commentInput: {
      minHeight: 110,
      fontSize: moderateScale(14),
      color: "#26332E",
      lineHeight: moderateScale(20),
    },

    completeButton: {
      minHeight: 55,
      borderRadius: 14,
      backgroundColor: "#087A4A",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 2,
      marginBottom: 20,
    },

    completeButtonDisabled: {
      backgroundColor: "#A9B9B2",
    },

    completeButtonText: {
      marginLeft: 8,
      color: "#FFFFFF",
      fontSize: moderateScale(16),
      fontWeight: "800",
    },

    completedBanner: {
      backgroundColor: "#E8F7EF",
      borderRadius: 15,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },

    completedBannerText: {
      flex: 1,
      marginLeft: 10,
    },

    completedBannerTitle: {
      fontSize: moderateScale(16),
      fontWeight: "800",
      color: "#087A4A",
    },

    completedBannerSubtitle: {
      marginTop: 4,
      fontSize: moderateScale(12),
      color: "#5C7569",
    },

    commentItem: {
      paddingVertical: 13,
    },

    commentBorder: {
      borderBottomWidth: 1,
      borderBottomColor: "#E9EFEC",
    },

    commentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },

    commentBy: {
      fontSize: moderateScale(13),
      fontWeight: "800",
      color: "#26332E",
      flexShrink: 1,
    },

    commentDate: {
      fontSize: moderateScale(10),
      color: "#8A9691",
    },

    commentStatus: {
      marginTop: 3,
      fontSize: moderateScale(10),
      fontWeight: "700",
      color: "#D86A16",
    },

    commentMessage: {
      marginTop: 6,
      fontSize: moderateScale(13),
      lineHeight: moderateScale(19),
      color: "#66736D",
    },

    attachmentText: {
      marginTop: 6,
      fontSize: moderateScale(11),
      color: "#D86A16",
      fontWeight: "700",
    },
  });
}