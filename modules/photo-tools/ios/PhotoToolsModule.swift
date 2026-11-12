import ExpoModulesCore
import Photos
import Vision

// PhotoKit / Vision helpers that expo-media-library does not provide.
public class PhotoToolsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotoTools")

    // Original file sizes (bytes) via PHAssetResource's "fileSize" key.
    AsyncFunction("getFileSizes") { (ids: [String]) -> [String: Double] in
      var out: [String: Double] = [:]
      let result = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      result.enumerateObjects { asset, _, _ in
        let resources = PHAssetResource.assetResources(for: asset)
        let primary = resources.first(where: { $0.type == .photo || $0.type == .video }) ?? resources.first
        if let primary = primary, let size = primary.value(forKey: "fileSize") as? CLong {
          out[asset.localIdentifier] = Double(size)
        }
      }
      return out
    }

    // Newest geotagged assets (PhotoKit predicate; no need to page the whole library).
    AsyncFunction("getGeotagged") { (limit: Int) -> [[String: Any]] in
      let o = PHFetchOptions()
      o.predicate = NSPredicate(format: "location != nil")
      o.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
      o.fetchLimit = max(1, limit)
      var out: [[String: Any]] = []
      PHAsset.fetchAssets(with: o).enumerateObjects { a, _, _ in
        if let l = a.location {
          out.append(["id": a.localIdentifier, "lat": l.coordinate.latitude, "lng": l.coordinate.longitude])
        }
      }
      return out
    }

    // Groups visually similar assets. `ids` must be sorted by creation time;
    // each asset is compared with its next `window` neighbours (duplicates,
    // bursts and repeated screenshots are almost always adjacent in time).
    // Fully on-device: Vision image feature prints from small local thumbnails.
    AsyncFunction("findSimilarGroups") { (ids: [String], threshold: Double, window: Int) -> [[String]] in
      let fetched = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      var byId: [String: PHAsset] = [:]
      fetched.enumerateObjects { a, _, _ in byId[a.localIdentifier] = a }
      let ordered = ids.filter { byId[$0] != nil }

      let manager = PHImageManager.default()
      let opts = PHImageRequestOptions()
      opts.isSynchronous = true
      opts.deliveryMode = .fastFormat
      opts.resizeMode = .fast
      opts.isNetworkAccessAllowed = false // never pull iCloud originals for scanning

      var prints: [VNFeaturePrintObservation?] = []
      for id in ordered {
        var obs: VNFeaturePrintObservation? = nil
        autoreleasepool {
          manager.requestImage(for: byId[id]!, targetSize: CGSize(width: 299, height: 299),
                               contentMode: .aspectFill, options: opts) { image, _ in
            guard let cg = image?.cgImage else { return }
            let request = VNGenerateImageFeaturePrintRequest()
            let handler = VNImageRequestHandler(cgImage: cg, options: [:])
            if (try? handler.perform([request])) != nil {
              obs = request.results?.first as? VNFeaturePrintObservation
            }
          }
        }
        prints.append(obs)
      }

      // Union-find over close pairs.
      var parent = Array(0..<ordered.count)
      func find(_ x: Int) -> Int {
        var r = x
        while parent[r] != r { parent[r] = parent[parent[r]]; r = parent[r] }
        return r
      }
      for i in 0..<ordered.count {
        guard let a = prints[i] else { continue }
        let end = min(ordered.count, i + 1 + max(1, window))
        if i + 1 >= end { continue }
        for j in (i + 1)..<end {
          guard let b = prints[j] else { continue }
          var d: Float = 0
          if (try? a.computeDistance(&d, to: b)) != nil, Double(d) <= threshold {
            parent[find(j)] = find(i)
          }
        }
      }
      var groups: [Int: [String]] = [:]
      for i in 0..<ordered.count { groups[find(i), default: []].append(ordered[i]) }
      return groups.values.filter { $0.count > 1 }
    }
  }
}
