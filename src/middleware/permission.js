export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    next();
  };
};
