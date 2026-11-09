// Soft masks for a photo from macOS Vision, written as PNGs for cutout.py.
//
//   person_<n>.png  one soft mask per person instance (who is roughly where)
//   fg.png          the whole foreground lift (crisp outline of everything that is not background)
//   fg_<n>.png      each foreground instance (touching people merge into one)
//   people.png      the accurate person-segmentation class mask (all people, no ball)
//   masks.json      the image size and the instance labels
//
// usage: vision_masks <in.jpg> <out_dir>      (build once: swiftc -O vision_masks.swift -o vision_masks)
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { fputs("usage: vision_masks <in> <out_dir>\n", stderr); exit(2) }
let inURL = URL(fileURLWithPath: args[1])
let outDir = args[2]
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

guard let ciImage = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else {
  fputs("could not read \(inURL.path)\n", stderr); exit(1)
}
let ctx = CIContext()

func writePNG(_ buffer: CVPixelBuffer, _ path: String) throws {
  let out = CIImage(cvPixelBuffer: buffer)
  guard let cg = ctx.createCGImage(out, from: out.extent) else { fputs("render failed\n", stderr); exit(1) }
  let rep = NSBitmapImageRep(cgImage: cg)
  guard let data = rep.representation(using: .png, properties: [:]) else { fputs("png failed\n", stderr); exit(1) }
  try data.write(to: URL(fileURLWithPath: path))
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let people = VNGeneratePersonInstanceMaskRequest()
let fg = VNGenerateForegroundInstanceMaskRequest()
let seg = VNGeneratePersonSegmentationRequest()
seg.qualityLevel = .accurate
seg.outputPixelFormat = kCVPixelFormatType_OneComponent8
try handler.perform([people, fg, seg])

var info: [String: Any] = ["width": Int(ciImage.extent.width), "height": Int(ciImage.extent.height)]
var persons: [Int] = []
if let result = people.results?.first {
  for label in result.allInstances {
    let soft = try result.generateScaledMaskForImage(forInstances: IndexSet(integer: label), from: handler)
    try writePNG(soft, "\(outDir)/person_\(label).png")
    persons.append(label)
  }
}
info["persons"] = persons

var fgs: [Int] = []
if let result = fg.results?.first {
  let all = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
  try writePNG(all, "\(outDir)/fg.png")
  for label in result.allInstances {
    let soft = try result.generateScaledMaskForImage(forInstances: IndexSet(integer: label), from: handler)
    try writePNG(soft, "\(outDir)/fg_\(label).png")
    fgs.append(label)
  }
}
info["foregrounds"] = fgs

if let obs = seg.results?.first {
  try writePNG(obs.pixelBuffer, "\(outDir)/people.png")
  info["people"] = true
}

let data = try JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys])
try data.write(to: URL(fileURLWithPath: "\(outDir)/masks.json"))
print("masks written to \(outDir): \(persons.count) people, \(fgs.count) foreground instances")
