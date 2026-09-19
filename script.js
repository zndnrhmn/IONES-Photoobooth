/* IONES 2026 Photobooth
   Frame selector + iPad-friendly camera + 8-second countdown + screen flash
*/

const GOOGLE_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwbC6aVWF8ufwBy4GLe6eluiMJXXU-h3QapD55_ct1W8Yp6XhEwrXm1YKWbJvgDMmYS/exec";

const GOOGLE_DRIVE_FOLDER_URL =
    "https://drive.google.com/drive/folders/1ebG7aFVdHIKLrXDedEtNM-Y0A0J97L1S";

const PHOTO_COUNTDOWN_SECONDS = 8;


const FRAME_CONFIGS = {
    frame1: {
        name: "Frame 1",
        file: "frame1.png",
        width: 684,
        height: 2048,
        slots: [
            { x: 60, y: 73, width: 562, height: 423 },
            { x: 60, y: 539, width: 562, height: 422 },
            { x: 60, y: 1004, width: 562, height: 422 },
            { x: 60, y: 1469, width: 562, height: 423 }
        ]
    },
    frame2: {
        name: "Frame 2",
        file: "frame2.png",
        width: 1793,
        height: 2048,
        slots: [
            { x: 158, y: 178, width: 1477, height: 756 },
            { x: 158, y: 1114, width: 1477, height: 756 }
        ]
    }
};


let selectedFrameKey = null;
let selectedFrame = null;
let photos = [];
let stream = null;
let finalImageData = null;

const startScreen = document.getElementById("startScreen");
const frameScreen = document.getElementById("frameScreen");
const cameraScreen = document.getElementById("cameraScreen");
const resultScreen = document.getElementById("resultScreen");

const startButton = document.getElementById("startButton");
const continueButton = document.getElementById("continueButton");
const retakeButton = document.getElementById("retakeButton");
const downloadButton = document.getElementById("downloadButton");

const frameOptions = document.querySelectorAll(".frame-option");
const framePreview1 = document.getElementById("framePreview1");
const framePreview2 = document.getElementById("framePreview2");

const video = document.getElementById("video");
const countdown = document.getElementById("countdown");
const photoProgress = document.getElementById("photoProgress");
const flashOverlay = document.getElementById("flashOverlay");

const resultImage = document.getElementById("resultImage");
const qrCode = document.getElementById("qrCode");
const statusElement = document.getElementById("status");

function showScreen(screen) {
    [startScreen, frameScreen, cameraScreen, resultScreen].forEach(s => {
        if (s) s.classList.remove("active");
    });
    screen.classList.add("active");
}

function loadFramePreviews() {
    framePreview1.src = FRAME_CONFIGS.frame1.file;
    framePreview2.src = FRAME_CONFIGS.frame2.file;
}

function selectFrame(key) {
    selectedFrameKey = key;
    selectedFrame = FRAME_CONFIGS[key];

    frameOptions.forEach(option => {
        option.classList.toggle(
            "selected",
            option.dataset.frame === key
        );
    });

    continueButton.disabled = false;
}

async function openFrameSelector() {
    loadFramePreviews();
    showScreen(frameScreen);
}

async function startCamera() {
    if (!selectedFrame) return;

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "user" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        showScreen(cameraScreen);
        await new Promise(r => setTimeout(r, 700));
        await takePhotos();
    } catch (error) {
        console.error(error);
        alert(
            "Camera access is required. Please allow camera access in Safari and try again."
        );
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    video.srcObject = null;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCountdown(seconds) {
    for (let n = seconds; n >= 1; n--) {
        countdown.textContent = n;
        await wait(1000);
    }

    countdown.textContent = "📸";
    await screenFlash();
}

async function screenFlash() {
    flashOverlay.classList.add("flash-active");
    await wait(180);
    flashOverlay.classList.remove("flash-active");
    await wait(100);
}

function captureVideoFrame() {
    const canvas = document.createElement("canvas");

    // Keep a useful camera resolution while preserving the video's aspect ratio.
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const ctx = canvas.getContext("2d", { willReadFrequently: false });

    // Mirror the captured image to match the front-camera preview.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return canvas;
}

async function takePhotos() {
    photos = [];

    for (let i = 0; i < selectedFrame.slots.length; i++) {
        photoProgress.textContent =
            `Photo ${i + 1} of ${selectedFrame.slots.length}`;

        await runCountdown(PHOTO_COUNTDOWN_SECONDS);

        const captured = captureVideoFrame();
        photos.push(captured);

        await wait(450);
    }

    stopCamera();

    const result = await composePhotostrip();
    finalImageData = result;

    resultImage.src = result;

    generateQRCode(GOOGLE_DRIVE_FOLDER_URL);

    statusElement.textContent = "Uploading photo to Google Drive...";

    showScreen(resultScreen);

    uploadToGoogleDrive(result)
        .then(() => {
            statusElement.textContent =
                "Photo uploaded successfully. Scan the QR code to open the folder.";
        })
        .catch(error => {
            console.error("Upload error:", error);
            statusElement.textContent =
                "Upload failed. You can still download the photo.";
        });
}

function drawImageCover(ctx, image, x, y, width, height) {
    const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
    const sourceHeight = image.videoHeight || image.naturalHeight || image.height;

    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;

    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
    } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
    }

    ctx.drawImage(
        image,
        sx, sy, sw, sh,
        x, y, width, height
    );
}

async function composePhotostrip() {
    const frameImage = await loadImage(selectedFrame.file);

    const canvas = document.createElement("canvas");
    canvas.width = selectedFrame.width;
    canvas.height = selectedFrame.height;

    const ctx = canvas.getContext("2d");

    // Draw a transparent base.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    selectedFrame.slots.forEach((slot, i) => {
        const photo = photos[i];

        ctx.save();
        ctx.beginPath();
        ctx.rect(slot.x, slot.y, slot.width, slot.height);
        ctx.clip();

        drawImageCover(
            ctx,
            photo,
            slot.x,
            slot.y,
            slot.width,
            slot.height
        );

        ctx.restore();
    });

    // Draw the original PNG on top. Its transparent photo areas reveal the photos underneath.
    ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function generateQRCode(url) {
    qrCode.innerHTML = "";

    if (typeof QRCode === "undefined") {
        qrCode.textContent = "QR library not loaded";
        return;
    }

    new QRCode(qrCode, {
        text: url,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
    });
}

function uploadToGoogleDrive(pngData) {
    statusElement.textContent = "Uploading photo to Google Drive...";

    // iPad Safari can create a very large PNG data URL.
    // Convert only the upload copy to JPEG to make the POST much smaller.
    const uploadCanvas = document.createElement("canvas");
    const uploadImage = new Image();

    return new Promise((resolve, reject) => {
        uploadImage.onload = () => {
            try {
                uploadCanvas.width = uploadImage.naturalWidth;
                uploadCanvas.height = uploadImage.naturalHeight;

                const ctx = uploadCanvas.getContext("2d");

                // White background because JPEG does not support transparency.
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, uploadCanvas.width, uploadCanvas.height);
                ctx.drawImage(
                    uploadImage,
                    0,
                    0,
                    uploadCanvas.width,
                    uploadCanvas.height
                );

                const jpegData = uploadCanvas.toDataURL(
                    "image/jpeg",
                    0.82
                );

                const fileName =
                    `IONES-${selectedFrameKey}-${Date.now()}.jpg`;

                // IMPORTANT for iPad/Safari:
                // use a hidden iframe, not a new tab/window.
                const iframeName =
                    "ionesUploadFrame_" + Date.now();

                const iframe = document.createElement("iframe");
                iframe.name = iframeName;
                iframe.style.position = "fixed";
                iframe.style.width = "1px";
                iframe.style.height = "1px";
                iframe.style.opacity = "0";
                iframe.style.pointerEvents = "none";
                iframe.style.border = "0";
                document.body.appendChild(iframe);

                const form = document.createElement("form");
                form.method = "POST";
                form.action = GOOGLE_SCRIPT_URL;
                form.target = iframeName;
                form.enctype = "application/x-www-form-urlencoded";
                form.style.display = "none";

                const imageInput = document.createElement("input");
                imageInput.type = "hidden";
                imageInput.name = "image";
                imageInput.value = jpegData;

                const fileInput = document.createElement("input");
                fileInput.type = "hidden";
                fileInput.name = "fileName";
                fileInput.value = fileName;

                form.appendChild(imageInput);
                form.appendChild(fileInput);
                document.body.appendChild(form);

                let finished = false;

                const cleanup = () => {
                    setTimeout(() => {
                        form.remove();
                        iframe.remove();
                    }, 1000);
                };

                // Apps Script returns an HTML page. Its load event means
                // the POST request completed at the browser level.
                iframe.addEventListener("load", () => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    resolve();
                });

                // Safety timeout. This prevents the photobooth from hanging
                // forever if Safari does not fire iframe load.
                setTimeout(() => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    resolve();
                }, 12000);

                form.submit();

                // Release temporary objects after submission.
                setTimeout(() => {
                    uploadCanvas.width = 1;
                    uploadCanvas.height = 1;
                }, 1000);

            } catch (error) {
                reject(error);
            }
        };

        uploadImage.onerror = () => {
            reject(new Error("Could not prepare the image for upload."));
        };

        uploadImage.src = pngData;
    });
}

function downloadFinalImage() {
    if (!finalImageData) return;

    const link = document.createElement("a");
    link.href = finalImageData;
    link.download =
        `IONES-${selectedFrameKey}-Photostrip.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();
}

function retake() {
    stopCamera();
    photos = [];
    finalImageData = null;
    showScreen(frameScreen);
}

startButton.addEventListener("click", openFrameSelector);

frameOptions.forEach(option => {
    option.addEventListener("click", () => {
        selectFrame(option.dataset.frame);
    });
});

continueButton.addEventListener("click", startCamera);
downloadButton.addEventListener("click", downloadFinalImage);
retakeButton.addEventListener("click", retake);

window.addEventListener("beforeunload", stopCamera);

loadFramePreviews();

// Preload the frame images before a photo session.
Object.values(FRAME_CONFIGS).forEach(config => {
    const img = new Image();
    img.src = config.file;
});
