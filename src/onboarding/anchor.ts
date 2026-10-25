import { Matrix4, Quaternion, Vector3 } from "three";

/**
 * How far the camera still travels after the outro, in world units, before it
 * sits in the library's resting frame. The shelves are parented so that this
 * pose is the same view TourCamera opens on.
 */
export const LIBRARY_APPROACH = 16;

/**
 * Group.lookAt points the group's +Z at this spot. The child camera looks
 * down its own -Z, so the spot has to sit behind the eye for the view to
 * follow `travel`.
 */
export function groupLookTarget(
	eye: readonly [number, number, number],
	travel: readonly [number, number, number],
): [number, number, number] {
	return [eye[0] - travel[0], eye[1] - travel[1], eye[2] - travel[2]];
}

const look = new Vector3();
const up = new Vector3(0, 1, 0);
const forward = new Vector3();
const right = new Vector3();
const worldUp = new Vector3();
const libRight = new Vector3();
const libUp = new Vector3();
const desired = new Vector3();
const rotated = new Vector3();
const worldBasis = new Matrix4();
const localBasis = new Matrix4();
const anchorQuaternion = new Quaternion();
const pointQuaternion = new Quaternion();
const point = new Vector3();

/**
 * Rigid transform that parks the library in front of the tunnel. After it is
 * applied, the library's resting camera sits `approach` units ahead of `eye`
 * and still looks along `tangent`.
 */
export function placeLibraryAnchor(
	eye: readonly [number, number, number],
	tangent: readonly [number, number, number],
	restPosition: readonly [number, number, number],
	restTarget: readonly [number, number, number],
	approach = LIBRARY_APPROACH,
) {
	look.set(
		restTarget[0] - restPosition[0],
		restTarget[1] - restPosition[1],
		restTarget[2] - restPosition[2],
	);
	if (look.lengthSq() < 1e-8) look.set(0, 0, -1);
	else look.normalize();

	forward.set(tangent[0], tangent[1], tangent[2]);
	if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
	else forward.normalize();

	right.crossVectors(up, forward);
	if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
	else right.normalize();
	worldUp.crossVectors(forward, right).normalize();

	libRight.crossVectors(up, look);
	if (libRight.lengthSq() < 1e-6) libRight.set(1, 0, 0);
	else libRight.normalize();
	libUp.crossVectors(look, libRight).normalize();

	worldBasis.makeBasis(right, worldUp, forward);
	localBasis.makeBasis(libRight, libUp, look);
	anchorQuaternion.setFromRotationMatrix(
		worldBasis.multiply(localBasis.invert()),
	);

	desired.set(eye[0], eye[1], eye[2]).addScaledVector(forward, approach);
	rotated
		.set(restPosition[0], restPosition[1], restPosition[2])
		.applyQuaternion(anchorQuaternion);
	desired.sub(rotated);

	return {
		position: [desired.x, desired.y, desired.z] as [number, number, number],
		quaternion: [
			anchorQuaternion.x,
			anchorQuaternion.y,
			anchorQuaternion.z,
			anchorQuaternion.w,
		] as [number, number, number, number],
	};
}

export function transformByAnchor(
	anchorPosition: readonly [number, number, number],
	quaternion: readonly [number, number, number, number],
	local: readonly [number, number, number],
	out: Vector3,
) {
	pointQuaternion.set(
		quaternion[0],
		quaternion[1],
		quaternion[2],
		quaternion[3],
	);
	point.set(local[0], local[1], local[2]).applyQuaternion(pointQuaternion);
	out.set(
		anchorPosition[0] + point.x,
		anchorPosition[1] + point.y,
		anchorPosition[2] + point.z,
	);
	return out;
}
