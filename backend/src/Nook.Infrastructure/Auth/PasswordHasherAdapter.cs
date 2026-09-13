using Microsoft.AspNetCore.Identity;
using Nook.Application.Common;
using Nook.Domain.Entities;

namespace Nook.Infrastructure.Auth;

/// <summary>PBKDF2 via ASP.NET Core Identity's <see cref="PasswordHasher{TUser}"/>.</summary>
public sealed class PasswordHasherAdapter : IPasswordHasher
{
    private readonly PasswordHasher<User> _hasher = new();

    public string Hash(User user, string password) => _hasher.HashPassword(user, password);

    public bool? Verify(User user, string hash, string password) =>
        _hasher.VerifyHashedPassword(user, hash, password) switch
        {
            PasswordVerificationResult.Success => false,
            PasswordVerificationResult.SuccessRehashNeeded => true,
            _ => null,
        };
}
