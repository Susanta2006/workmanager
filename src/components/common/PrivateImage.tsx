import { useEffect, useState } from "react";
import { backend } from "@/api/backend";

/** Renders a privately stored image through a short-lived signed URL. */
export default function PrivateImage({ fileUri, alt = "", className = "" }: any) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl("");
    setFailed(false);
    if (!fileUri) return () => { alive = false; };

    backend.files.signedUrl({ file_uri: fileUri, expires_in: 600 })
      .then((result) => {
        if (alive) {
          if (result?.signed_url) setUrl(result.signed_url);
          else setFailed(true);
        }
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [fileUri]);

  if (!fileUri) return null;
  return (
    <span
      data-private-image
      data-loaded={url ? "true" : "false"}
      data-error={failed ? "true" : "false"}
      style={{ display: "contents" }}
    >
      {url ? <img src={url} alt={alt} className={className} /> : null}
    </span>
  );
}
