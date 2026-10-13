import { MaterialIcons } from "@expo/vector-icons";
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
    View,
    useWindowDimensions,
} from "react-native";

import deliveryService from "../../services/delivery.service";

// =============================================================
// RESPONSIVE SCALING HELPERS
// =============================================================
const GUIDELINE_BASE_WIDTH = 375; // iPhone-ish reference width

const scale = (size, width) => (width / GUIDELINE_BASE_WIDTH) * size;

const moderateScale = (size, width, factor = 0.5) =>
    size + (scale(size, width) - size) * factor;

export default function DeliveryDetail() {
    const { id } = useLocalSearchParams();
    const { width, height } = useWindowDimensions();

    const [ticket, setTicket] = useState(null);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [error, setError] = useState("");

    // OTP
    const [otp, setOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    // Proof image
    const [proofImage, setProofImage] = useState(null);

    // Failure
    const [failureReason, setFailureReason] = useState("");

    // =========================================================
    // LOAD DELIVERY
    // =========================================================
    const loadDelivery = async () => {
        try {
            setLoading(true);
            setError("");

            if (!id) {
                throw new Error("Delivery ID is missing");
            }

            const data =
                await deliveryService.getDeliveryById(id);

            setTicket(data);
        } catch (err) {
            console.error(
                "[DeliveryDetail] Load error:",
                err
            );

            setError(
                err?.message ||
                "Unable to load delivery details."
            );
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDelivery();

            return undefined;
        }, [id])
    );

    // =========================================================
    // HELPERS
    // =========================================================
    const getCustomerMobile = () => {
        return (
            ticket?.customerMobile ||
            ticket?.customerPhone ||
            ticket?.phone ||
            ""
        );
    };

    const getCustomerName = () => {
        return (
            ticket?.customerName ||
            ticket?.customer ||
            "Customer"
        );
    };

    const getAddress = () => {
        const address =
            ticket?.serviceAddress;

        if (!address) {
            return (
                ticket?.site ||
                "Address not available"
            );
        }

        if (typeof address === "string") {
            return address;
        }

        return [
            address?.line1,
            address?.line2,
            address?.city,
            address?.state,
            address?.pincode,
        ]
            .filter(Boolean)
            .join(", ");
    };

    const getStatusLabel = (status) => {
        if (!status) {
            return "Unknown";
        }

        return status
            .replace(/_/g, " ")
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "DELIVERY_DONE":
                return "#15803D";

            case "OUT_FOR_DELIVERY":
            case "IN_PROGRESS":
            case "ASSIGNED_TO_DELIVERY":
                return "#1565C0";

            case "CANCELLED":
                return "#DC2626";

            default:
                return "#64748B";
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) {
            return "--";
        }

        const date =
            new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return "--";
        }

        return date.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );
    };

    // =========================================================
    // SEND OTP
    // =========================================================
    const sendOtp = async () => {
        const customerMobile =
            getCustomerMobile();

        if (!customerMobile) {
            Alert.alert(
                "Customer Mobile Missing",
                "Customer mobile number is not available for this delivery."
            );
            return;
        }

        try {
            setSendingOtp(true);

            await deliveryService.sendCustomerOtp(
                customerMobile
            );

            setOtpSent(true);
            setOtpVerified(false);
            setOtp("");

            Alert.alert(
                "OTP Sent",
                "Customer OTP has been sent successfully."
            );
        } catch (err) {
            console.error(
                "[DeliveryDetail] Send OTP error:",
                err
            );

            Alert.alert(
                "OTP Error",
                err?.message ||
                "Unable to send OTP."
            );
        } finally {
            setSendingOtp(false);
        }
    };

    // =========================================================
    // VERIFY OTP
    // =========================================================
    const verifyOtp = async () => {
        const customerMobile =
            getCustomerMobile();

        if (!customerMobile) {
            Alert.alert(
                "Customer Mobile Missing",
                "Customer mobile number is not available."
            );
            return;
        }

        if (!otp || otp.length < 4) {
            Alert.alert(
                "Invalid OTP",
                "Please enter the customer OTP."
            );
            return;
        }

        try {
            setVerifyingOtp(true);

            await deliveryService.verifyCustomerOtp(
                customerMobile,
                otp
            );

            setOtpVerified(true);

            Alert.alert(
                "OTP Verified",
                "Customer OTP has been verified successfully."
            );
        } catch (err) {
            console.error(
                "[DeliveryDetail] Verify OTP error:",
                err
            );

            setOtpVerified(false);

            Alert.alert(
                "Invalid OTP",
                err?.message ||
                "OTP verification failed."
            );
        } finally {
            setVerifyingOtp(false);
        }
    };

    // =========================================================
    // PICK PROOF IMAGE
    // =========================================================
    const pickProofImage = async () => {
        try {
            const permission =
                await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                Alert.alert(
                    "Permission Required",
                    "Please allow photo library access to select delivery proof."
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

            const asset =
                result.assets?.[0];

            if (!asset?.uri) {
                return;
            }

            setProofImage({
                uri: asset.uri,
                fileName:
                    asset.fileName ||
                    `delivery-proof-${Date.now()}.jpg`,
                mimeType:
                    asset.mimeType ||
                    "image/jpeg",
            });
        } catch (err) {
            console.error(
                "[DeliveryDetail] Pick image error:",
                err
            );

            Alert.alert(
                "Photo Error",
                "Unable to select the proof image."
            );
        }
    };

    // =========================================================
    // TAKE PROOF PHOTO
    // =========================================================
    const takeProofPhoto = async () => {
        try {
            const permission =
                await ImagePicker.requestCameraPermissionsAsync();

            if (!permission.granted) {
                Alert.alert(
                    "Permission Required",
                    "Please allow camera access to take delivery proof."
                );

                return;
            }

            const result =
                await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    quality: 0.8,
                });

            if (result.canceled) {
                return;
            }

            const asset =
                result.assets?.[0];

            if (!asset?.uri) {
                return;
            }

            setProofImage({
                uri: asset.uri,
                fileName:
                    asset.fileName ||
                    `delivery-proof-${Date.now()}.jpg`,
                mimeType:
                    asset.mimeType ||
                    "image/jpeg",
            });
        } catch (err) {
            console.error(
                "[DeliveryDetail] Camera error:",
                err
            );

            Alert.alert(
                "Camera Error",
                "Unable to take the proof photo."
            );
        }
    };

    // =========================================================
    // REMOVE PROOF IMAGE
    // =========================================================
    const removeProofImage = () => {
        setProofImage(null);
    };

    // =========================================================
    // MARK DELIVERED
    // =========================================================
    const completeDelivery = async () => {
        if (!ticket?._id) {
            return;
        }

        if (!otpVerified) {
            Alert.alert(
                "OTP Required",
                "Please verify the customer OTP before completing the delivery."
            );

            return;
        }

        if (!proofImage) {
            Alert.alert(
                "Proof Required",
                "Please add a delivery proof photo before completing the delivery."
            );

            return;
        }

        Alert.alert(
            "Complete Delivery",
            "Are you sure you want to mark this delivery as completed?",
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Complete",
                    onPress: submitCompletedDelivery,
                },
            ]
        );
    };

    const submitCompletedDelivery = async () => {
        try {
            setSubmitting(true);

            await deliveryService.markDelivered({
                ticketId: ticket._id,

                images: [
                    proofImage,
                ],

                comment:
                    "Delivery completed successfully",
            });

            Alert.alert(
                "Delivery Completed",
                "The delivery has been marked as completed.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            router.replace(
                                "/(delivery)/deliveries"
                            );
                        },
                    },
                ]
            );
        } catch (err) {
            console.error(
                "[DeliveryDetail] Complete delivery error:",
                err
            );

            Alert.alert(
                "Update Failed",
                err?.message ||
                "Unable to complete delivery."
            );
        } finally {
            setSubmitting(false);
        }
    };

    // =========================================================
    // MARK FAILED
    // =========================================================
    const failDelivery = async () => {
        if (!ticket?._id) {
            return;
        }

        if (!failureReason.trim()) {
            Alert.alert(
                "Reason Required",
                "Please enter the reason why this delivery could not be completed."
            );

            return;
        }

        Alert.alert(
            "Mark Delivery Failed",
            "Are you sure you want to mark this delivery as failed?",
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Mark Failed",
                    style: "destructive",
                    onPress:
                        submitFailedDelivery,
                },
            ]
        );
    };

    const submitFailedDelivery = async () => {
        try {
            setSubmitting(true);

            await deliveryService.markDeliveryFailed({
                ticketId: ticket._id,

                failureReason:
                    failureReason.trim(),

                comment:
                    failureReason.trim(),
            });

            Alert.alert(
                "Delivery Updated",
                "The delivery has been marked as failed.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            router.replace(
                                "/(delivery)/deliveries"
                            );
                        },
                    },
                ]
            );
        } catch (err) {
            console.error(
                "[DeliveryDetail] Failed delivery error:",
                err
            );

            Alert.alert(
                "Update Failed",
                err?.message ||
                "Unable to update delivery."
            );
        } finally {
            setSubmitting(false);
        }
    };

    // =========================================================
    // RESPONSIVE STYLES
    // =========================================================
    const isTablet = width >= 768;

    const styles = useMemo(
        () => createStyles(width, height, { isTablet }),
        [width, height, isTablet]
    );

    // =========================================================
    // LOADING
    // =========================================================
    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator
                    size="large"
                    color="#1565C0"
                />

                <Text style={styles.loadingText}>
                    Loading delivery details...
                </Text>
            </View>
        );
    }

    // =========================================================
    // ERROR
    // =========================================================
    if (error || !ticket) {
        return (
            <View style={styles.centerContainer}>
                <View style={styles.errorIcon}>
                    <MaterialIcons
                        name="error-outline"
                        size={moderateScale(42, width)}
                        color="#DC2626"
                    />
                </View>

                <Text style={styles.errorTitle}>
                    Unable to load delivery
                </Text>

                <Text style={styles.errorMessage}>
                    {error ||
                        "Delivery task not found."}
                </Text>

                <View style={styles.errorButtons}>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={loadDelivery}
                    >
                        <MaterialIcons
                            name="refresh"
                            size={moderateScale(20, width)}
                            color="#FFFFFF"
                        />

                        <Text
                            style={styles.retryText}
                        >
                            Retry
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() =>
                            router.back()
                        }
                    >
                        <Text
                            style={
                                styles.backButtonText
                            }
                        >
                            Go Back
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const statusColor =
        getStatusColor(ticket.status);

    const isCompleted =
        ticket.isDeliveryDone === true ||
        ticket.status === "DELIVERY_DONE";

    const isFailed =
        ticket.status === "CANCELLED";

    return (
        <View style={styles.container}>

            {/* ================================================= */}
            {/* HEADER */}
            {/* ================================================= */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerBack}
                    onPress={() =>
                        router.back()
                    }
                >
                    <MaterialIcons
                        name="arrow-back"
                        size={moderateScale(23, width)}
                        color="#fff"
                    />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
                        Delivery Details
                    </Text>

                    <Text
                        style={styles.headerTicket}
                    >
                        #
                        {ticket.ticketNumber ||
                            ticket._id}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.headerRefresh}
                    onPress={loadDelivery}
                >
                    <MaterialIcons
                        name="refresh"
                        size={moderateScale(21, width)}
                        color="#fff"
                    />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                    styles.scrollContent
                }
            >

                {/* ================================================= */}
                {/* STATUS */}
                {/* ================================================= */}
                <View style={styles.statusCard}>
                    <View>
                        <Text
                            style={styles.statusLabel}
                        >
                            CURRENT STATUS
                        </Text>

                        <Text
                            style={[
                                styles.statusValue,
                                {
                                    color: statusColor,
                                },
                            ]}
                        >
                            {getStatusLabel(
                                ticket.status
                            )}
                        </Text>
                    </View>

                    <View
                        style={[
                            styles.statusIcon,
                            {
                                backgroundColor:
                                    `${statusColor}18`,
                            },
                        ]}
                    >
                        <MaterialIcons
                            name={
                                isCompleted
                                    ? "check-circle"
                                    : isFailed
                                        ? "cancel"
                                        : "local-shipping"
                            }
                            size={moderateScale(27, width)}
                            color={statusColor}
                        />
                    </View>
                </View>

                {/* ================================================= */}
                {/* CUSTOMER */}
                {/* ================================================= */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        Customer Information
                    </Text>

                    <DetailRow
                        styles={styles}
                        width={width}
                        icon="person-outline"
                        label="Customer"
                        value={getCustomerName()}
                    />

                    <DetailRow
                        styles={styles}
                        width={width}
                        icon="phone"
                        label="Mobile"
                        value={
                            getCustomerMobile() ||
                            "Not available"
                        }
                    />

                    {ticket.email && (
                        <DetailRow
                            styles={styles}
                            width={width}
                            icon="email"
                            label="Email"
                            value={ticket.email}
                        />
                    )}
                </View>

                {/* ================================================= */}
                {/* ADDRESS */}
                {/* ================================================= */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        Delivery Address
                    </Text>

                    <View style={styles.addressDetail}>
                        <View
                            style={styles.detailIcon}
                        >
                            <MaterialIcons
                                name="location-on"
                                size={moderateScale(20, width)}
                                color="#1565C0"
                            />
                        </View>

                        <Text
                            style={
                                styles.addressDetailText
                            }
                        >
                            {getAddress()}
                        </Text>
                    </View>
                </View>

                {/* ================================================= */}
                {/* TICKET INFORMATION */}
                {/* ================================================= */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        Delivery Information
                    </Text>

                    <DetailRow
                        styles={styles}
                        width={width}
                        icon="confirmation-number"
                        label="Ticket"
                        value={
                            ticket.ticketNumber ||
                            ticket._id
                        }
                    />

                    {ticket.orderId && (
                        <DetailRow
                            styles={styles}
                            width={width}
                            icon="shopping-bag"
                            label="Order ID"
                            value={ticket.orderId}
                        />
                    )}

                    {ticket.type && (
                        <DetailRow
                            styles={styles}
                            width={width}
                            icon="category"
                            label="Type"
                            value={ticket.type}
                        />
                    )}

                    {ticket.category && (
                        <DetailRow
                            styles={styles}
                            width={width}
                            icon="label-outline"
                            label="Category"
                            value={ticket.category}
                        />
                    )}

                    <DetailRow
                        styles={styles}
                        width={width}
                        icon="event"
                        label="Created"
                        value={formatDate(
                            ticket.createdAt
                        )}
                    />
                </View>

                {/* ================================================= */}
                {/* OTP SECTION */}
                {/* ================================================= */}
                {!isCompleted &&
                    !isFailed && (
                        <View style={styles.card}>
                            <View
                                style={
                                    styles.sectionTitleRow
                                }
                            >
                                <View>
                                    <Text
                                        style={
                                            styles.cardTitle
                                        }
                                    >
                                        Customer OTP
                                    </Text>

                                    <Text
                                        style={
                                            styles.cardSubtitle
                                        }
                                    >
                                        Verify customer before
                                        completing delivery
                                    </Text>
                                </View>

                                <View
                                    style={[
                                        styles.otpStatus,
                                        {
                                            backgroundColor:
                                                otpVerified
                                                    ? "#DCFCE7"
                                                    : "#FEF3C7",
                                        },
                                    ]}
                                >
                                    <MaterialIcons
                                        name={
                                            otpVerified
                                                ? "check"
                                                : "lock-outline"
                                        }
                                        size={moderateScale(15, width)}
                                        color={
                                            otpVerified
                                                ? "#15803D"
                                                : "#D97706"
                                        }
                                    />

                                    <Text
                                        style={[
                                            styles.otpStatusText,
                                            {
                                                color:
                                                    otpVerified
                                                        ? "#15803D"
                                                        : "#D97706",
                                            },
                                        ]}
                                    >
                                        {otpVerified
                                            ? "Verified"
                                            : "Not Verified"}
                                    </Text>
                                </View>
                            </View>

                            <View
                                style={
                                    styles.otpPhoneBox
                                }
                            >
                                <MaterialIcons
                                    name="phone"
                                    size={moderateScale(18, width)}
                                    color="#64748B"
                                />

                                <Text
                                    style={
                                        styles.otpPhone
                                    }
                                >
                                    {getCustomerMobile() ||
                                        "Customer mobile unavailable"}
                                </Text>
                            </View>

                            {!otpSent ? (
                                <TouchableOpacity
                                    style={
                                        styles.primaryButton
                                    }
                                    onPress={sendOtp}
                                    disabled={sendingOtp}
                                >
                                    {sendingOtp ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#FFFFFF"
                                        />
                                    ) : (
                                        <>
                                            <MaterialIcons
                                                name="sms"
                                                size={moderateScale(20, width)}
                                                color="#FFFFFF"
                                            />

                                            <Text
                                                style={
                                                    styles.primaryButtonText
                                                }
                                            >
                                                Send Customer OTP
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <View
                                        style={
                                            styles.otpInputRow
                                        }
                                    >
                                        <TextInput
                                            style={
                                                styles.otpInput
                                            }
                                            value={otp}
                                            onChangeText={(value) =>
                                                setOtp(
                                                    value.replace(
                                                        /[^0-9]/g,
                                                        ""
                                                    )
                                                )
                                            }
                                            placeholder="Enter OTP"
                                            placeholderTextColor="#94A3B8"
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            editable={
                                                !otpVerified
                                            }
                                        />

                                        <TouchableOpacity
                                            style={[
                                                styles.verifyButton,
                                                otpVerified &&
                                                styles.verifiedButton,
                                            ]}
                                            onPress={
                                                verifyOtp
                                            }
                                            disabled={
                                                verifyingOtp ||
                                                otpVerified
                                            }
                                        >
                                            {verifyingOtp ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color="#FFFFFF"
                                                />
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.verifyButtonText
                                                    }
                                                >
                                                    {otpVerified
                                                        ? "Verified"
                                                        : "Verify"}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    {!otpVerified && (
                                        <TouchableOpacity
                                            style={
                                                styles.resendButton
                                            }
                                            onPress={
                                                sendOtp
                                            }
                                            disabled={
                                                sendingOtp
                                            }
                                        >
                                            <MaterialIcons
                                                name="refresh"
                                                size={moderateScale(16, width)}
                                                color="#1565C0"
                                            />

                                            <Text
                                                style={
                                                    styles.resendText
                                                }
                                            >
                                                Resend OTP
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </View>
                    )}

                {/* ================================================= */}
                {/* PROOF PHOTO */}
                {/* ================================================= */}
                {!isCompleted &&
                    !isFailed && (
                        <View style={styles.card}>
                            <Text
                                style={styles.cardTitle}
                            >
                                Delivery Proof
                            </Text>

                            <Text
                                style={styles.cardSubtitle}
                            >
                                Add a photo before completing
                                the delivery
                            </Text>

                            {proofImage ? (
                                <View
                                    style={
                                        styles.proofContainer
                                    }
                                >
                                    <Image
                                        source={{
                                            uri: proofImage.uri,
                                        }}
                                        style={
                                            styles.proofImage
                                        }
                                    />

                                    <TouchableOpacity
                                        style={
                                            styles.removePhotoButton
                                        }
                                        onPress={
                                            removeProofImage
                                        }
                                    >
                                        <MaterialIcons
                                            name="close"
                                            size={moderateScale(19, width)}
                                            color="#FFFFFF"
                                        />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View
                                    style={
                                        styles.photoButtons
                                    }
                                >
                                    <TouchableOpacity
                                        style={
                                            styles.photoButton
                                        }
                                        onPress={
                                            takeProofPhoto
                                        }
                                    >
                                        <View
                                            style={
                                                styles.photoIcon
                                            }
                                        >
                                            <MaterialIcons
                                                name="camera-alt"
                                                size={moderateScale(23, width)}
                                                color="#1565C0"
                                            />
                                        </View>

                                        <Text
                                            style={
                                                styles.photoButtonText
                                            }
                                        >
                                            Take Photo
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={
                                            styles.photoButton
                                        }
                                        onPress={
                                            pickProofImage
                                        }
                                    >
                                        <View
                                            style={
                                                styles.photoIcon
                                            }
                                        >
                                            <MaterialIcons
                                                name="photo-library"
                                                size={moderateScale(23, width)}
                                                color="#1565C0"
                                            />
                                        </View>

                                        <Text
                                            style={
                                                styles.photoButtonText
                                            }
                                        >
                                            Choose Photo
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                {/* ================================================= */}
                {/* COMPLETE DELIVERY */}
                {/* ================================================= */}
                {!isCompleted &&
                    !isFailed && (
                        <TouchableOpacity
                            style={[
                                styles.completeButton,
                                (!otpVerified ||
                                    !proofImage ||
                                    submitting) &&
                                styles.disabledButton,
                            ]}
                            onPress={
                                completeDelivery
                            }
                            disabled={
                                !otpVerified ||
                                !proofImage ||
                                submitting
                            }
                        >
                            {submitting ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#FFFFFF"
                                />
                            ) : (
                                <>
                                    <MaterialIcons
                                        name="check-circle"
                                        size={moderateScale(22, width)}
                                        color="#FFFFFF"
                                    />

                                    <Text
                                        style={
                                            styles.completeButtonText
                                        }
                                    >
                                        Complete Delivery
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                {/* ================================================= */}
                {/* FAILURE SECTION */}
                {/* ================================================= */}
                {!isCompleted &&
                    !isFailed && (
                        <View
                            style={
                                styles.failureCard
                            }
                        >
                            <Text
                                style={
                                    styles.failureTitle
                                }
                            >
                                Unable to complete delivery?
                            </Text>

                            <Text
                                style={
                                    styles.failureSubtitle
                                }
                            >
                                Enter the reason and mark the
                                delivery as failed.
                            </Text>

                            <TextInput
                                style={
                                    styles.failureInput
                                }
                                value={
                                    failureReason
                                }
                                onChangeText={
                                    setFailureReason
                                }
                                placeholder="Enter failure reason"
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={
                                    styles.failureButton
                                }
                                onPress={
                                    failDelivery
                                }
                                disabled={
                                    submitting
                                }
                            >
                                <MaterialIcons
                                    name="cancel"
                                    size={moderateScale(20, width)}
                                    color="#DC2626"
                                />

                                <Text
                                    style={
                                        styles.failureButtonText
                                    }
                                >
                                    Mark Delivery Failed
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                {/* ================================================= */}
                {/* COMPLETED MESSAGE */}
                {/* ================================================= */}
                {isCompleted && (
                    <View
                        style={
                            styles.completedCard
                        }
                    >
                        <View
                            style={
                                styles.completedIcon
                            }
                        >
                            <MaterialIcons
                                name="check-circle"
                                size={moderateScale(42, width)}
                                color="#15803D"
                            />
                        </View>

                        <Text
                            style={
                                styles.completedTitle
                            }
                        >
                            Delivery Completed
                        </Text>

                        <Text
                            style={
                                styles.completedText
                            }
                        >
                            This delivery has already been
                            completed successfully.
                        </Text>
                    </View>
                )}

                {/* ================================================= */}
                {/* FAILED MESSAGE */}
                {/* ================================================= */}
                {isFailed && (
                    <View
                        style={styles.failedCard}
                    >
                        <View
                            style={
                                styles.failedIcon
                            }
                        >
                            <MaterialIcons
                                name="cancel"
                                size={moderateScale(42, width)}
                                color="#DC2626"
                            />
                        </View>

                        <Text
                            style={
                                styles.failedTitle
                            }
                        >
                            Delivery Failed
                        </Text>

                        <Text
                            style={
                                styles.failedText
                            }
                        >
                            This delivery has been marked
                            as failed.
                        </Text>
                    </View>
                )}

                <View
                    style={{ height: moderateScale(35, width) }}
                />
            </ScrollView>
        </View>
    );
}

// =============================================================
// DETAIL ROW
// =============================================================
function DetailRow({
    styles,
    width,
    icon,
    label,
    value,
}) {
    return (
        <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
                <MaterialIcons
                    name={icon}
                    size={moderateScale(19, width)}
                    color="#64748B"
                />
            </View>

            <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>
                    {label}
                </Text>

                <Text
                    style={styles.detailValue}
                    numberOfLines={3}
                >
                    {value}
                </Text>
            </View>
        </View>
    );
}

// =============================================================
// STYLES (generated per-dimension so it reflows on rotation/resize)
// =============================================================
function createStyles(width, height, { isTablet }) {
    const ms = (size, factor) => moderateScale(size, width, factor);
    const contentMaxWidth = isTablet ? 700 : undefined;

    return StyleSheet.create({

        container: {
            flex: 1,
            backgroundColor: "#F8FAFC",
        },

        centerContainer: {
            flex: 1,
            backgroundColor: "#F8FAFC",
            alignItems: "center",
            justifyContent: "center",
            padding: ms(24),
        },

        loadingText: {
            marginTop: ms(12),
            fontSize: ms(14),
            color: "#64748B",
            fontWeight: "500",
        },

        errorIcon: {
            width: ms(72),
            height: ms(72),
            borderRadius: ms(36),
            backgroundColor: "#FEF2F2",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: ms(16),
        },

        errorTitle: {
            fontSize: ms(19),
            fontWeight: "900",
            color: "#1E293B",
            marginBottom: ms(8),
        },

        errorMessage: {
            fontSize: ms(13),
            color: "#64748B",
            textAlign: "center",
            lineHeight: ms(20),
            marginBottom: ms(20),
        },

        errorButtons: {
            alignItems: "center",
            gap: ms(10),
        },

        retryButton: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#1565C0",
            paddingHorizontal: ms(22),
            paddingVertical: ms(12),
            borderRadius: ms(10),
            gap: ms(7),
        },

        retryText: {
            color: "#FFFFFF",
            fontSize: ms(14),
            fontWeight: "700",
        },

        backButton: {
            paddingHorizontal: ms(22),
            paddingVertical: ms(11),
        },

        backButtonText: {
            color: "#1565C0",
            fontSize: ms(14),
            fontWeight: "700",
        },

        // =========================================================
        // HEADER
        // =========================================================

        header: {
            height: 160,
            paddingTop: 50,
            paddingHorizontal: 18,
            backgroundColor: "#0F2D52",
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
            flexDirection: "row",
            alignItems: "center",
        },

        headerBack: {
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
        },

        headerCenter: {
            flex: 1,
            marginLeft: 14,
        },

        headerTitle: {
            fontSize: ms(20, 0.4),
            fontWeight: "bold",
            color: "#FFFFFF",
        },

        headerTicket: {
            fontSize: ms(12),
            color: "#F5A623",
            marginTop: ms(2),
            fontWeight: "700",
        },

        headerRefresh: {
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
        },

        scrollContent: {
            paddingTop: ms(12),
            maxWidth: contentMaxWidth,
            width: "100%",
            alignSelf: "center",
        },

        // =========================================================
        // STATUS
        // =========================================================

        statusCard: {
            marginHorizontal: ms(14),
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: ms(14),
            padding: ms(16),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },

        statusLabel: {
            fontSize: ms(9),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 1,
        },

        statusValue: {
            fontSize: ms(20),
            fontWeight: "900",
            marginTop: ms(4),
        },

        statusIcon: {
            width: ms(50),
            height: ms(50),
            borderRadius: ms(14),
            alignItems: "center",
            justifyContent: "center",
        },

        // =========================================================
        // CARDS
        // =========================================================

        card: {
            marginHorizontal: ms(14),
            marginTop: ms(12),
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: ms(14),
            padding: ms(16),
        },

        cardTitle: {
            fontSize: ms(16),
            fontWeight: "900",
            color: "#0F172A",
        },

        cardSubtitle: {
            fontSize: ms(11),
            color: "#94A3B8",
            lineHeight: ms(17),
            marginTop: ms(3),
        },

        detailRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: ms(15),
            gap: ms(10),
        },

        detailIcon: {
            width: ms(34),
            height: ms(34),
            borderRadius: ms(9),
            backgroundColor: "#F8FAFC",
            alignItems: "center",
            justifyContent: "center",
        },

        detailContent: {
            flex: 1,
        },

        detailLabel: {
            fontSize: ms(8),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 0.8,
        },

        detailValue: {
            fontSize: ms(13),
            fontWeight: "700",
            color: "#334155",
            marginTop: ms(3),
            lineHeight: ms(18),
        },

        addressDetail: {
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: ms(15),
            gap: ms(10),
        },

        addressDetailText: {
            flex: 1,
            fontSize: ms(13),
            color: "#475569",
            lineHeight: ms(20),
        },

        // =========================================================
        // OTP
        // =========================================================

        sectionTitleRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
        },

        otpStatus: {
            flexDirection: "row",
            alignItems: "center",
            borderRadius: ms(20),
            paddingHorizontal: ms(9),
            paddingVertical: ms(6),
            gap: ms(4),
        },

        otpStatusText: {
            fontSize: ms(9),
            fontWeight: "800",
        },

        otpPhoneBox: {
            backgroundColor: "#F8FAFC",
            borderRadius: ms(10),
            padding: ms(12),
            marginTop: ms(14),
            flexDirection: "row",
            alignItems: "center",
            gap: ms(8),
        },

        otpPhone: {
            flex: 1,
            fontSize: ms(13),
            color: "#475569",
            fontWeight: "700",
        },

        primaryButton: {
            height: ms(48),
            backgroundColor: "#1565C0",
            borderRadius: ms(10),
            marginTop: ms(12),
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: ms(8),
        },

        primaryButtonText: {
            color: "#FFFFFF",
            fontSize: ms(13),
            fontWeight: "800",
        },

        otpInputRow: {
            flexDirection: "row",
            marginTop: ms(12),
            gap: ms(8),
        },

        otpInput: {
            flex: 1,
            height: ms(48),
            borderWidth: 1,
            borderColor: "#CBD5E1",
            borderRadius: ms(10),
            backgroundColor: "#FFFFFF",
            paddingHorizontal: ms(14),
            fontSize: ms(18),
            fontWeight: "800",
            color: "#0F172A",
            letterSpacing: 4,
        },

        verifyButton: {
            width: ms(100),
            height: ms(48),
            borderRadius: ms(10),
            backgroundColor: "#1565C0",
            alignItems: "center",
            justifyContent: "center",
        },

        verifiedButton: {
            backgroundColor: "#15803D",
        },

        verifyButtonText: {
            color: "#FFFFFF",
            fontSize: ms(12),
            fontWeight: "800",
        },

        resendButton: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: ms(12),
            gap: ms(5),
        },

        resendText: {
            fontSize: ms(11),
            color: "#1565C0",
            fontWeight: "700",
        },

        // =========================================================
        // PROOF PHOTO
        // =========================================================

        proofContainer: {
            marginTop: ms(14),
            height: ms(220),
            borderRadius: ms(12),
            overflow: "hidden",
            backgroundColor: "#F1F5F9",
            position: "relative",
        },

        proofImage: {
            width: "100%",
            height: "100%",
            resizeMode: "cover",
        },

        removePhotoButton: {
            position: "absolute",
            top: ms(10),
            right: ms(10),
            width: ms(34),
            height: ms(34),
            borderRadius: ms(17),
            backgroundColor: "#DC2626",
            alignItems: "center",
            justifyContent: "center",
        },

        photoButtons: {
            flexDirection: "row",
            gap: ms(10),
            marginTop: ms(14),
        },

        photoButton: {
            flex: 1,
            minHeight: ms(100),
            borderWidth: 1,
            borderColor: "#BFDBFE",
            borderStyle: "dashed",
            borderRadius: ms(11),
            backgroundColor: "#F8FBFF",
            alignItems: "center",
            justifyContent: "center",
        },

        photoIcon: {
            width: ms(42),
            height: ms(42),
            borderRadius: ms(12),
            backgroundColor: "#EFF6FF",
            alignItems: "center",
            justifyContent: "center",
        },

        photoButtonText: {
            fontSize: ms(11),
            fontWeight: "800",
            color: "#1565C0",
            marginTop: ms(8),
        },

        // =========================================================
        // COMPLETE
        // =========================================================

        completeButton: {
            marginHorizontal: ms(14),
            marginTop: ms(14),
            height: ms(54),
            borderRadius: ms(12),
            backgroundColor: "#15803D",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: ms(8),
        },

        completeButtonText: {
            color: "#FFFFFF",
            fontSize: ms(14),
            fontWeight: "900",
        },

        disabledButton: {
            backgroundColor: "#94A3B8",
        },

        // =========================================================
        // FAILURE
        // =========================================================

        failureCard: {
            marginHorizontal: ms(14),
            marginTop: ms(12),
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#FECACA",
            borderRadius: ms(14),
            padding: ms(16),
        },

        failureTitle: {
            fontSize: ms(14),
            fontWeight: "900",
            color: "#991B1B",
        },

        failureSubtitle: {
            fontSize: ms(11),
            color: "#94A3B8",
            lineHeight: ms(17),
            marginTop: ms(3),
        },

        failureInput: {
            minHeight: ms(90),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: ms(10),
            backgroundColor: "#F8FAFC",
            marginTop: ms(12),
            paddingHorizontal: ms(12),
            paddingVertical: ms(10),
            fontSize: ms(12),
            color: "#334155",
        },

        failureButton: {
            height: ms(46),
            borderWidth: 1,
            borderColor: "#FCA5A5",
            borderRadius: ms(10),
            marginTop: ms(10),
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: ms(7),
        },

        failureButtonText: {
            fontSize: ms(12),
            fontWeight: "800",
            color: "#DC2626",
        },

        // =========================================================
        // COMPLETED / FAILED
        // =========================================================

        completedCard: {
            marginHorizontal: ms(14),
            marginTop: ms(14),
            backgroundColor: "#F0FDF4",
            borderWidth: 1,
            borderColor: "#BBF7D0",
            borderRadius: ms(14),
            padding: ms(25),
            alignItems: "center",
        },

        completedIcon: {
            width: ms(70),
            height: ms(70),
            borderRadius: ms(35),
            backgroundColor: "#DCFCE7",
            alignItems: "center",
            justifyContent: "center",
        },

        completedTitle: {
            fontSize: ms(18),
            fontWeight: "900",
            color: "#166534",
            marginTop: ms(12),
        },

        completedText: {
            fontSize: ms(12),
            color: "#4D7C5B",
            textAlign: "center",
            lineHeight: ms(18),
            marginTop: ms(5),
        },

        failedCard: {
            marginHorizontal: ms(14),
            marginTop: ms(14),
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FECACA",
            borderRadius: ms(14),
            padding: ms(25),
            alignItems: "center",
        },

        failedIcon: {
            width: ms(70),
            height: ms(70),
            borderRadius: ms(35),
            backgroundColor: "#FEE2E2",
            alignItems: "center",
            justifyContent: "center",
        },

        failedTitle: {
            fontSize: ms(18),
            fontWeight: "900",
            color: "#991B1B",
            marginTop: ms(12),
        },

        failedText: {
            fontSize: ms(12),
            color: "#7F1D1D",
            textAlign: "center",
            lineHeight: ms(18),
            marginTop: ms(5),
        },
    });
}