/* =========================================================
   IONES 2026 PHOTOBOOTH
   =========================================================

   FILES:
   index.html
   style.css
   script.js
   frame.png

   Put frame.png in the SAME folder as these 3 files.

   Google Drive:
   Replace GOOGLE_SCRIPT_URL with your Apps Script Web App URL.
   ========================================================= */


/* =========================================================
   GOOGLE APPS SCRIPT URL
   ========================================================= */

const GOOGLE_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwbC6aVWF8ufwBy4GLe6eluiMJXXU-h3QapD55_ct1W8Yp6XhEwrXm1YKWbJvgDMmYS/exec";

// Google Drive folder shown in the QR code.
// Replace PASTE_FOLDER_ID with the ID of your event's Drive folder.
const GOOGLE_DRIVE_FOLDER_URL =
    "https://drive.google.com/drive/folders/1ebG7aFVdHIKLrXDedEtNM-Y0A0J97L1S";


const FRAME_WIDTH = 685;
const FRAME_HEIGHT = 2048;


const PHOTO_SLOTS = [
    {
        x: 60,
        y: 149,
        width: 561,
        height: 347
    },
    {
        x: 60,
        y: 539,
        width: 561,
        height: 422
    },
    {
        x: 60,
        y: 1004,
        width: 561,
        height: 422
    },
    {
        x: 60,
        y: 1469,
        width: 561,
        height: 328
    }
];


/* =========================================================
   ELEMENTS
   ========================================================= */

const startScreen =
    document.getElementById("startScreen");

const cameraScreen =
    document.getElementById("cameraScreen");

const resultScreen =
    document.getElementById("resultScreen");

const startButton =
    document.getElementById("startButton");

const captureButton =
    document.getElementById("captureButton");

const retakeButton =
    document.getElementById("retakeButton");

const downloadButton =
    document.getElementById("downloadButton");

const video =
    document.getElementById("video");

const countdownElement =
    document.getElementById("countdown");

const flashElement =
    document.getElementById("screenFlash");

const photoCounter =
    document.getElementById("photoCounter");

const resultImage =
    document.getElementById("resultImage");

const qrCode =
    document.getElementById("qrcode");

const statusElement =
    document.getElementById("status");

const loading =
    document.getElementById("loading");


/* =========================================================
   VARIABLES
   ========================================================= */

let stream = null;
let photos = [];
let finalImageData = null;
let finalDownloadURL = null;
let isTakingPhotos = false;


/* =========================================================
   FRAME IMAGE
   ========================================================= */

const frameImage = new Image();

frameImage.src = "frame.png";


/* =========================================================
   SCREEN CONTROL
   ========================================================= */

function showScreen(screen) {
    document.querySelectorAll(".screen").forEach(item => {
        item.classList.remove("active");
    });

    screen.classList.add("active");
}


/* =========================================================
   CAMERA
   ========================================================= */

async function startCamera() {
    try {
        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            throw new Error(
                "Camera API is not available. " +
                "Use HTTPS or localhost."
            );
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {
                    ideal: "user"
                },
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

    } catch (error) {
        console.error(error);

        alert(
            "Camera access failed.\n\n" +
            "Please allow camera permission " +
            "and make sure the website uses HTTPS."
        );

        showScreen(startScreen);
    }
}


function stopCamera() {
    if (!stream) return;

    stream.getTracks().forEach(track => {
        track.stop();
    });

    stream = null;
    video.srcObject = null;
}


/* =========================================================
   COUNTDOWN
   ========================================================= */

function runCountdown(seconds = 3) {
    return new Promise(resolve => {
        let count = seconds;

        countdownElement.textContent = count;

        const interval = setInterval(() => {
            count--;

            if (count > 0) {
                countdownElement.textContent = count;
            } else {
                clearInterval(interval);
                countdownElement.textContent = "";
                resolve();
            }
        }, 1000);
    });
}


/* =========================================================
   SCREEN FLASH
   ========================================================= */

function triggerScreenFlash() {
    if (!flashElement) return;

    flashElement.classList.remove("flash-active");

    // Force a reflow so repeated flashes always animate.
    void flashElement.offsetWidth;

    flashElement.classList.add("flash-active");

    setTimeout(() => {
        flashElement.classList.remove("flash-active");
    }, 220);
}


/* =========================================================
   CAPTURE PHOTO
   ========================================================= */

function capturePhoto() {
    const canvas =
        document.createElement("canvas");

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    /*
     * Mirror selfie camera so the preview
     * and final photo look natural.
     */

    ctx.translate(width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
        video,
        0,
        0,
        width,
        height
    );

    const image = new Image();

    image.src = canvas.toDataURL(
        "image/jpeg",
        0.92
    );

    return image;
}


/* =========================================================
   WAIT FOR IMAGE
   ========================================================= */

function waitForImage(image) {
    return new Promise(resolve => {
        if (image.complete &&
            image.naturalWidth > 0) {

            resolve();
            return;
        }

        image.onload = resolve;
    });
}


/* =========================================================
   DRAW IMAGE COVER
   Prevents stretching/distortion.
   ========================================================= */

function drawImageCover(
    ctx,
    image,
    x,
    y,
    width,
    height
) {
    const imageRatio =
        image.width / image.height;

    const boxRatio =
        width / height;

    let sourceWidth;
    let sourceHeight;
    let sourceX;
    let sourceY;

    if (imageRatio > boxRatio) {

        /*
         * Photo is wider than the slot.
         * Crop left/right.
         */

        sourceHeight = image.height;

        sourceWidth =
            image.height * boxRatio;

        sourceX =
            (image.width - sourceWidth) / 2;

        sourceY = 0;

    } else {

        /*
         * Photo is taller than the slot.
         * Crop top/bottom.
         */

        sourceWidth = image.width;

        sourceHeight =
            image.width / boxRatio;

        sourceX = 0;

        sourceY =
            (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(
        image,

        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,

        x,
        y,
        width,
        height
    );
}


/* =========================================================
   CREATE FINAL PHOTOSTRIP
   ========================================================= */

async function createFinalPhotostrip() {
    await waitForImage(frameImage);

    const canvas =
        document.createElement("canvas");

    canvas.width = frameImage.naturalWidth || FRAME_WIDTH;
    canvas.height = frameImage.naturalHeight || FRAME_HEIGHT;

    const ctx =
        canvas.getContext("2d");

    /*
     * Draw each photo behind the frame.
     */

    for (let i = 0; i < photos.length; i++) {
        const slot = PHOTO_SLOTS[i];

        ctx.save();

        // Keep the photo strictly inside its PNG photo area.
        ctx.beginPath();
        ctx.rect(
            slot.x,
            slot.y,
            slot.width,
            slot.height
        );
        ctx.clip();

        // Cover the entire photo area while preserving aspect ratio.
        drawImageCover(
            ctx,
            photos[i],
            slot.x,
            slot.y,
            slot.width,
            slot.height
        );

        ctx.restore();
    }

    /*
     * Draw the PNG frame ON TOP.
     */

    ctx.drawImage(
        frameImage,
        0,
        0,
        canvas.width,
        canvas.height
    );

    /*
     * PNG preserves the transparent areas
     * in the uploaded frame.
     */

    return canvas.toDataURL(
        "image/png"
    );
}


/* =========================================================
   TAKE FOUR PHOTOS
   ========================================================= */

const PHOTO_COUNTDOWN_SECONDS = 8;

async function takePhotos() {
    if (isTakingPhotos) return;

    isTakingPhotos = true;
    photos = [];

    captureButton.style.display = "none";

    for (let i = 0; i < 4; i++) {

        photoCounter.textContent =
            `Photo ${i + 1} of 4`;

        /*
         * Give the user 8 seconds to pose.
         */

        await runCountdown(PHOTO_COUNTDOWN_SECONDS);

        // Flash the iPad screen for every photo.
        triggerScreenFlash();

        // Capture just after the flash starts.
        const photo =
            capturePhoto();

        await waitForImage(photo);

        photos.push(photo);

        /*
         * Short pause after each shot; the next photo has its own 8-second countdown.
         */

        await new Promise(resolve => {
            setTimeout(resolve, 700);
        });
    }

    isTakingPhotos = false;

    captureButton.style.display = "block";

    await showFinalResult();
}


/* =========================================================
   FINAL RESULT
   ========================================================= */

async function showFinalResult() {
    stopCamera();

    showScreen(resultScreen);

    loading.classList.add("active");

    statusElement.textContent =
        "Creating your photostrip...";

    try {

        finalImageData =
            await createFinalPhotostrip();

        resultImage.src =
            finalImageData;

        // The QR code always points to the shared Google Drive folder,
        // not to an individual photo.
        generateQRCode(GOOGLE_DRIVE_FOLDER_URL);

        /*
         * Upload if Google Apps Script
         * has already been configured.
         */

        if (
            GOOGLE_SCRIPT_URL &&
            !GOOGLE_SCRIPT_URL.includes(
                "PASTE_YOUR"
            )
        ) {

            statusElement.textContent =
                "Uploading to Google Drive...";

            await uploadToGoogleDrive(
                finalImageData
            );

        } else {

            /*
             * Google Drive is not configured yet.
             */

            statusElement.textContent =
                "Photo ready! Configure Google Drive for QR download.";

            /*
             * Direct download still works.
             */

            downloadButton.disabled = false;
        }

    } catch (error) {

        console.error(error);

        statusElement.textContent =
            "Photo created. Scan the QR code to open the photo folder, or download the photo here.";

    }

    loading.classList.remove("active");
}


/* =========================================================
   GOOGLE DRIVE UPLOAD
   ========================================================= */

async function uploadToGoogleDrive(imageData) {

    statusElement.textContent =
        "Uploading photo to Google Drive...";

    const fileName =
        "IONES-Photobooth-" +
        Date.now() +
        ".jpg";

    try {
        /*
         * iPad/Safari can be unreliable when a very large PNG is placed
         * inside a hidden form input. Compress the final photostrip to
         * JPEG before sending it. The original PNG is still kept for the
         * Download Photo button.
         */
        const uploadData = await compressForUpload(imageData);

        /*
         * Send a simple URL-encoded POST with no-cors.
         * This does not require the browser to read the Apps Script
         * response, which avoids Safari cross-origin iframe problems.
         */
        const body = new URLSearchParams();
        body.append("image", uploadData);
        body.append("fileName", fileName);

        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: body.toString()
        });

        finalDownloadURL = null;

        statusElement.textContent =
            "Photo uploaded to Google Drive. Scan the QR code to open the photo folder.";

    } catch (error) {
        console.error("Google Drive upload error:", error);
        throw error;
    }
}


/*
 * Compress the final photostrip before uploading.
 * This is specifically to make the upload more reliable on iPad/Safari.
 */
function compressForUpload(imageData) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth || FRAME_WIDTH;
                canvas.height = image.naturalHeight || FRAME_HEIGHT;

                const ctx = canvas.getContext("2d", {
                    alpha: false
                });

                // White background for JPEG.
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

                const compressed = canvas.toDataURL(
                    "image/jpeg",
                    0.88
                );

                resolve(compressed);
            } catch (error) {
                reject(error);
            }
        };

        image.onerror = () => {
            reject(new Error("Could not prepare image for upload."));
        };

        image.src = imageData;
    });
}


/* =========================================================
   QR CODE
   ========================================================= */

function generateQRCode(url) {

    qrCode.innerHTML = "";

    if (!url || url.includes("PASTE_FOLDER_ID")) {

        console.error(
            "QR ERROR: Google Drive folder URL is not configured."
        );

        qrCode.innerHTML =
            "<p style='color:#000;text-align:center;font-size:12px;'>Set your Google Drive folder URL in script.js</p>";

        return;
    }


    console.log(
        "Generating QR for:",
        url
    );


    if (
        typeof QRCode ===
        "undefined"
    ) {

        console.error(
            "QRCode library is not loaded."
        );

        qrCode.innerHTML =
            "<p style='color:#000;text-align:center;font-size:12px;'>QR library failed to load</p>";

        return;
    }


    new QRCode(
        qrCode,
        {
            text: url,

            width: 180,

            height: 180,

            correctLevel:
                QRCode.CorrectLevel.H
        }
    );
}


/* =========================================================
   DOWNLOAD
   ========================================================= */

downloadButton.addEventListener(
    "click",
    () => {

        if (!finalImageData) {
            return;
        }

        const link =
            document.createElement("a");

        link.href =
            finalImageData;

        link.download =
            "IONES-Photobooth.png";

        document.body.appendChild(link);

        link.click();

        link.remove();
    }
);


/* =========================================================
   START
   ========================================================= */

startButton.addEventListener(
    "click",
    async () => {

        showScreen(cameraScreen);

        await startCamera();

        /*
         * Wait for camera to stabilize.
         */

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
        });

        if (stream) {
            await takePhotos();
        }
    }
);


/* =========================================================
   MANUAL CAPTURE BUTTON
   =========================================================

   The normal flow automatically takes all 4 photos.
   This button is kept as a fallback/manual option.
   ========================================================= */

captureButton.addEventListener(
    "click",
    async () => {

        await takePhotos();

    }
);


/* =========================================================
   RETAKE
   ========================================================= */

retakeButton.addEventListener(
    "click",
    async () => {

        stopCamera();

        photos = [];
        finalImageData = null;
        finalDownloadURL = null;

        resultImage.src = "";
        qrCode.innerHTML = "";

        statusElement.textContent =
            "Preparing your photo...";

        showScreen(cameraScreen);

        await startCamera();

        await new Promise(resolve => {
            setTimeout(resolve, 1000);
        });

        if (stream) {
            await takePhotos();
        }
    }
);


/* =========================================================
   PREVENT DOUBLE-TAP ZOOM
   ========================================================= */

document.addEventListener(
    "dblclick",
    event => {
        event.preventDefault();
    },
    {
        passive: false
    }
);


/* =========================================================
   FRAME ERROR CHECK
   ========================================================= */

frameImage.onload = () => {
    console.log(
        "IONES frame loaded:",
        frameImage.width,
        "x",
        frameImage.height
    );
};

frameImage.onerror = () => {
    console.error(
        "frame.png could not be loaded."
    );

    alert(
        "frame.png could not be loaded.\n\n" +
        "Please make sure frame.png is in the same folder " +
        "as index.html."
    );
};
