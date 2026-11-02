import { useEffect, useState } from "react";
import { backend } from "@/api/backend";

/** Renders a privately stored image through a short-lived signed URL. */
export default function PrivateImage({ fileUri, alt = "", className = "" }: any) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;
    if (!fileUri) {
      setUrl("");
      return () => {
        alive = false;
      };
    }
    backend.files.signedUrl({
      file_uri: fileUri,
      expires_in: 600,
    })
      .then((result) => {
        if (alive) setUrl(result?.signed_url || "");
      })
      .catch(() => {
        if (alive) setUrl("");
      });
    return () => {
      alive = false;
    };
  }, [fileUri]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
