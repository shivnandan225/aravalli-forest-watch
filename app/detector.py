from dataclasses import dataclass
@dataclass
class MediaInspection:
    media_type: str
    readable: bool
    dimensions: tuple[int, int] | None = None
    provider: str = "unconfigured"
    message: str = "No object-detection model is configured. No activity finding was generated."


class DetectionProvider:
    """Replace this provider with a vetted detector without changing the API."""

    def inspect(self, content: bytes, media_type: str) -> MediaInspection:
        raise NotImplementedError


class OpenCVMetadataProvider(DetectionProvider):
    def inspect(self, content: bytes, media_type: str) -> MediaInspection:
        if media_type != "image":
            return MediaInspection(
                media_type=media_type,
                readable=bool(content),
                message="Video received. Frame analysis is unavailable until a detection model is configured.",
            )
        try:
            import cv2
            import numpy as np
        except ImportError:
            return MediaInspection(
                media_type=media_type,
                readable=False,
                message="OpenCV is unavailable. Install the declared dependencies to inspect images.",
            )

        image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return MediaInspection(
                media_type=media_type,
                readable=False,
                message="The image could not be decoded. No activity finding was generated.",
            )
        height, width = image.shape[:2]
        return MediaInspection(
            media_type=media_type,
            readable=True,
            dimensions=(width, height),
        )


detector: DetectionProvider = OpenCVMetadataProvider()
