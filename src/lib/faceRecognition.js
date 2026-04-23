import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false

export async function loadModels() {
  if (modelsLoaded) return
  const MODEL_URL = '/models'
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])
  modelsLoaded = true
}

export async function getDescriptorFromUrl(imageUrl) {
  const img = await faceapi.fetchImage(imageUrl)
  const detection = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor()
  return detection?.descriptor || null
}

export async function getDescriptorFromVideo(videoElement) {
  const detection = await faceapi
    .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor()
  return detection?.descriptor || null
}

export function compareFaces(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) return 0
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2)
  // distance 0 = idêntico, > 0.6 = pessoas diferentes
  const confidence = Math.max(0, 1 - distance / 0.6)
  return confidence
}

export const CONFIDENCE_THRESHOLD = 0.55
